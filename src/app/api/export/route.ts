import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { endOfDay, startOfDay } from "@/lib/format";
import type { TransactionType } from "@/lib/types";

const MONTH_LABELS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const TYPE_LABEL: Record<TransactionType, string> = {
  sale: "Penjualan",
  income: "Pemasukan",
  expense: "Pengeluaran",
};

interface ExportRow {
  id: number;
  type: TransactionType;
  total: number;
  payment_method: string | null;
  category: string | null;
  note: string | null;
  cashier_name: string | null;
  cash_received: number | null;
  change_amount: number;
  created_at: string;
  transaction_items?: { product_name: string; qty: number; subtotal: number }[];
}

interface LedgerRow {
  kind: string;
  amount: number;
  transaction_id: number | null;
  created_at: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") === "monthly" ? "monthly" : "daily";
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");

  if (!startParam || !endParam) {
    return new Response("Parameter tanggal tidak lengkap.", { status: 400 });
  }

  const start = startOfDay(new Date(`${startParam}T00:00:00`));
  const end = endOfDay(new Date(`${endParam}T00:00:00`));

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return new Response("Tanggal tidak valid.", { status: 400 });
  }

  const supabase = await createClient().catch(() => null);
  if (!supabase) {
    return new Response("Supabase belum dikonfigurasi.", { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Tidak diizinkan.", { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "owner") {
    return new Response("Hanya owner yang dapat mengekspor laporan.", {
      status: 403,
    });
  }

  const [transactionsRes, ledgerRes] = await Promise.all([
    supabase
      .from("transactions")
      .select(
        "id, type, total, payment_method, category, note, cashier_name, cash_received, change_amount, created_at, transaction_items(product_name, qty, subtotal)",
      )
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())
      .order("created_at", { ascending: true }),
    supabase
      .from("customer_ledger")
      .select("kind, amount, transaction_id, created_at")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString()),
  ]);

  if (transactionsRes.error) {
    return new Response(transactionsRes.error.message, { status: 500 });
  }
  if (ledgerRes.error) {
    return new Response(ledgerRes.error.message, { status: 500 });
  }

  const rows = (transactionsRes.data ?? []) as unknown as ExportRow[];
  const ledgerRows = (ledgerRes.data ?? []) as unknown as LedgerRow[];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Angkringan POS";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Transaksi");
  sheet.columns = [
    { header: "Tanggal", key: "date", width: 22 },
    { header: "Jenis", key: "type", width: 14 },
    { header: "Keterangan", key: "description", width: 40 },
    { header: "Kategori", key: "category", width: 18 },
    { header: "Metode", key: "method", width: 12 },
    { header: "Kasir", key: "cashier", width: 20 },
    { header: "Total", key: "total", width: 16 },
  ];

  rows.forEach((row) => {
    sheet.addRow({
      date: new Date(row.created_at),
      type: TYPE_LABEL[row.type],
      description:
        row.type === "sale"
          ? (row.transaction_items ?? [])
              .map((item) => `${item.product_name} x${item.qty}`)
              .join(", ")
          : row.note || row.category || "-",
      category: row.category ?? "-",
      method: row.payment_method ?? "-",
      cashier: row.cashier_name ?? "-",
      total: Number(row.total),
    });
  });

  sheet.getColumn("date").numFmt = "dd/mm/yyyy hh:mm";
  sheet.getColumn("total").numFmt = '#,##0';
  styleHeader(sheet);

  const totalSales = rows
    .filter((row) => row.type === "sale")
    .reduce((sum, row) => sum + Number(row.total), 0);
  const totalOtherIncome = rows
    .filter((row) => row.type === "income")
    .reduce((sum, row) => sum + Number(row.total), 0);
  const totalExpense = rows
    .filter((row) => row.type === "expense")
    .reduce((sum, row) => sum + Number(row.total), 0);
  const totalCashIn =
    rows.reduce((sum, row) => {
      if (row.type === "income") return sum + Number(row.total);
      if (row.type !== "sale") return sum;
      return (
        sum +
        Number(row.cash_received ?? row.total) -
        Number(row.change_amount ?? 0)
      );
    }, 0) +
    ledgerRows.reduce((sum, item) => {
      if (item.transaction_id) return sum;
      if (item.kind === "debt_payment" || item.kind === "deposit_add") {
        return sum + Number(item.amount);
      }
      if (item.kind === "deposit_refund") return sum - Number(item.amount);
      return sum;
    }, 0);
  const totalProfit = totalSales + totalOtherIncome - totalExpense;

  const totalRow = sheet.addRow({
    description: "TOTAL",
    total: totalProfit,
  });
  totalRow.font = { bold: true };
  totalRow.getCell("total").numFmt = '#,##0';

  const summary = workbook.addWorksheet(
    mode === "monthly" ? "Rekap Bulanan" : "Rekap Harian",
  );
  summary.columns = [
    { header: "Periode", key: "period", width: 24 },
    { header: "Penjualan", key: "sales", width: 18 },
    { header: "Pemasukan Lain", key: "otherIncome", width: 18 },
    { header: "Kas Masuk", key: "cashIn", width: 18 },
    { header: "Pengeluaran", key: "expense", width: 18 },
    { header: "Laba", key: "profit", width: 18 },
    { header: "Transaksi", key: "count", width: 12 },
  ];

  buildSummary(rows, ledgerRows, mode, start, end).forEach((item) => {
    summary.addRow(item);
  });

  summary.getColumn("sales").numFmt = '#,##0';
  summary.getColumn("otherIncome").numFmt = '#,##0';
  summary.getColumn("cashIn").numFmt = '#,##0';
  summary.getColumn("expense").numFmt = '#,##0';
  summary.getColumn("profit").numFmt = '#,##0';
  styleHeader(summary);

  summary.addRow({
    period: "TOTAL",
    sales: totalSales,
    otherIncome: totalOtherIncome,
    cashIn: totalCashIn,
    expense: totalExpense,
    profit: totalProfit,
    count: rows.length,
  });
  summary.lastRow!.font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `laporan-angkringan-${startParam}_${endParam}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF059669" },
  };
  header.alignment = { vertical: "middle", horizontal: "center" };
  header.height = 22;
}

function buildSummary(
  rows: ExportRow[],
  ledgerRows: LedgerRow[],
  mode: "daily" | "monthly",
  start: Date,
  end: Date,
) {
  const map = new Map<
    string,
    {
      period: string;
      sales: number;
      otherIncome: number;
      cashIn: number;
      expense: number;
      profit: number;
      count: number;
    }
  >();

  const keyFor = (date: Date) =>
    mode === "monthly"
      ? `${date.getFullYear()}-${date.getMonth()}`
      : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

  if (mode === "monthly") {
    for (let month = 0; month < 12; month += 1) {
      const key = `${start.getFullYear()}-${month}`;
      map.set(key, {
        period: `${MONTH_LABELS[month]} ${start.getFullYear()}`,
        sales: 0,
        otherIncome: 0,
        cashIn: 0,
        expense: 0,
        profit: 0,
        count: 0,
      });
    }
  } else {
    const cursor = new Date(start);
    while (cursor <= end) {
      const key = keyFor(cursor);
      map.set(key, {
        period: new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(
          cursor,
        ),
        sales: 0,
        otherIncome: 0,
        cashIn: 0,
        expense: 0,
        profit: 0,
        count: 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  rows.forEach((row) => {
    const entry = map.get(keyFor(new Date(row.created_at)));
    if (!entry) return;
    if (row.type === "expense") {
      entry.expense += Number(row.total);
    } else if (row.type === "income") {
      entry.otherIncome += Number(row.total);
      entry.cashIn += Number(row.total);
    } else {
      entry.sales += Number(row.total);
      entry.cashIn +=
        Number(row.cash_received ?? row.total) -
        Number(row.change_amount ?? 0);
    }
    entry.count += 1;
  });

  ledgerRows.forEach((item) => {
    if (item.transaction_id) return;
    const entry = map.get(keyFor(new Date(item.created_at)));
    if (!entry) return;
    if (item.kind === "debt_payment" || item.kind === "deposit_add") {
      entry.cashIn += Number(item.amount);
    } else if (item.kind === "deposit_refund") {
      entry.cashIn -= Number(item.amount);
    }
  });

  return Array.from(map.values()).map((entry) => ({
    ...entry,
    profit: entry.sales + entry.otherIncome - entry.expense,
  }));
}
