"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Loader2,
  Printer,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { ReportChart } from "@/components/report-chart";
import { createClient } from "@/lib/supabase/client";
import {
  endOfDay,
  formatRupiah,
  startOfDay,
  toDateInput,
} from "@/lib/format";
import type { TransactionType } from "@/lib/types";

type Mode = "daily" | "monthly";

interface ReportRow {
  key: string;
  label: string;
  income: number;
  expense: number;
  count: number;
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

export default function ReportsPage() {
  const now = new Date();
  const [mode, setMode] = useState<Mode>("daily");
  const [from, setFrom] = useState(
    toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
  );
  const [to, setTo] = useState(toDateInput(now));
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<"owner" | "cashier">("cashier");
  const [exporting, setExporting] = useState(false);

  const range = useMemo(() => {
    if (mode === "monthly") {
      return {
        start: new Date(year, 0, 1),
        end: new Date(year, 11, 31),
      };
    }
    return {
      start: new Date(`${from}T00:00:00`),
      end: new Date(`${to}T00:00:00`),
    };
  }, [mode, from, to, year]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();
          if (active && profile?.role) {
            setRole(profile.role as "owner" | "cashier");
          }
        }

        if (Number.isNaN(range.start.getTime()) || Number.isNaN(range.end.getTime())) {
          throw new Error("Rentang tanggal tidak valid.");
        }

        const { data, error } = await supabase
          .from("transactions")
          .select("type, total, created_at")
          .gte("created_at", startOfDay(range.start).toISOString())
          .lte("created_at", endOfDay(range.end).toISOString());

        if (error) throw error;

        const rowsData = (data ?? []) as {
          type: TransactionType;
          total: number;
          created_at: string;
        }[];

        if (active) {
          setRows(buildRows(rowsData, mode, range.start, range.end));
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Gagal memuat laporan.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [mode, from, to, year, range]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.income += row.income;
        acc.expense += row.expense;
        acc.count += row.count;
        return acc;
      },
      { income: 0, expense: 0, count: 0 },
    );
  }, [rows]);

  const exportQuery = useMemo(() => {
    const params = new URLSearchParams({
      mode,
      start: toDateInput(range.start),
      end: toDateInput(range.end),
    });
    return params.toString();
  }, [mode, range]);

  function handleExport() {
    setExporting(true);
    const link = document.createElement("a");
    link.href = `/api/export?${exportQuery}`;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => setExporting(false), 1500);
  }

  if (!loading && role !== "owner") {
    return (
      <div className="card card-pad">
        <h1 className="text-lg font-semibold text-slate-900">Laporan</h1>
        <p className="mt-1 text-sm text-slate-500">
          Halaman laporan hanya dapat diakses oleh owner.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Laporan
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Rekap pemasukan, pengeluaran, dan laba.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || loading}
            className="btn-secondary"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export Excel
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="btn-secondary"
          >
            <Printer className="h-4 w-4" />
            Cetak
          </button>
        </div>
      </div>

      <div className="card card-pad">
        <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMode("daily")}
            className={modeClass(mode === "daily")}
          >
            Harian
          </button>
          <button
            type="button"
            onClick={() => setMode("monthly")}
            className={modeClass(mode === "monthly")}
          >
            Bulanan
          </button>
        </div>

        {mode === "daily" ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
            <div>
              <label htmlFor="reportFrom" className="label">
                Dari tanggal
              </label>
              <input
                id="reportFrom"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="reportTo" className="label">
                Sampai tanggal
              </label>
              <input
                id="reportTo"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="input"
              />
            </div>
          </div>
        ) : (
          <div className="max-w-[12rem]">
            <label htmlFor="reportYear" className="label">
              Tahun
            </label>
            <select
              id="reportYear"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="input"
            >
              {[0, 1, 2, 3, 4].map((offset) => (
                <option key={offset} value={now.getFullYear() - offset}>
                  {now.getFullYear() - offset}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total pemasukan"
          value={formatRupiah(totals.income)}
          icon={<TrendingUp className="h-5 w-5" />}
          tone="emerald"
        />
        <StatCard
          label="Total pengeluaran"
          value={formatRupiah(totals.expense)}
          icon={<TrendingDown className="h-5 w-5" />}
          tone="rose"
        />
        <StatCard
          label="Laba bersih"
          value={formatRupiah(totals.income - totals.expense)}
          icon={<Wallet className="h-5 w-5" />}
          tone="sky"
        />
        <StatCard
          label="Jumlah transaksi"
          value={String(totals.count)}
          icon={<Wallet className="h-5 w-5" />}
          tone="amber"
        />
      </div>

      <div className="card card-pad">
        <h2 className="mb-4 text-base font-semibold text-slate-900">
          Grafik {mode === "daily" ? "harian" : "bulanan"}
        </h2>
        {loading ? (
          <div className="flex h-72 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
          </div>
        ) : (
          <ReportChart
            labels={rows.map((row) => row.label)}
            income={rows.map((row) => row.income)}
            expense={rows.map((row) => row.expense)}
          />
        )}
      </div>

      <div className="table-wrap">
        <table className="table-base">
          <thead>
            <tr>
              <th>{mode === "daily" ? "Tanggal" : "Bulan"}</th>
              <th className="text-right">Pemasukan</th>
              <th className="text-right">Pengeluaran</th>
              <th className="text-right">Laba</th>
              <th className="text-right">Transaksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="py-10 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-emerald-500" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-slate-500">
                  Belum ada data pada periode ini.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.key} className="hover:bg-slate-50/60">
                  <td className="font-medium text-slate-800">{row.label}</td>
                  <td className="text-right text-emerald-600">
                    {formatRupiah(row.income)}
                  </td>
                  <td className="text-right text-rose-600">
                    {formatRupiah(row.expense)}
                  </td>
                  <td className="text-right font-semibold text-slate-800">
                    {formatRupiah(row.income - row.expense)}
                  </td>
                  <td className="text-right text-slate-500">{row.count}</td>
                </tr>
              ))
            )}
          </tbody>
          {!loading && rows.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <td className="px-4 py-3 text-slate-800">Total</td>
                <td className="px-4 py-3 text-right text-emerald-700">
                  {formatRupiah(totals.income)}
                </td>
                <td className="px-4 py-3 text-right text-rose-700">
                  {formatRupiah(totals.expense)}
                </td>
                <td className="px-4 py-3 text-right text-slate-900">
                  {formatRupiah(totals.income - totals.expense)}
                </td>
                <td className="px-4 py-3 text-right text-slate-600">
                  {totals.count}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function buildRows(
  data: { type: TransactionType; total: number; created_at: string }[],
  mode: Mode,
  start: Date,
  end: Date,
): ReportRow[] {
  const rows: ReportRow[] = [];
  const index = new Map<string, ReportRow>();

  if (mode === "monthly") {
    for (let month = 0; month < 12; month += 1) {
      const key = `${start.getFullYear()}-${String(month + 1).padStart(2, "0")}`;
      const row: ReportRow = {
        key,
        label: `${MONTH_LABELS[month]} ${start.getFullYear()}`,
        income: 0,
        expense: 0,
        count: 0,
      };
      rows.push(row);
      index.set(key, row);
    }
  } else {
    const cursor = new Date(start);
    while (cursor <= end) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
      const row: ReportRow = {
        key,
        label: new Intl.DateTimeFormat("id-ID", {
          day: "numeric",
          month: "short",
        }).format(cursor),
        income: 0,
        expense: 0,
        count: 0,
      };
      rows.push(row);
      index.set(key, row);
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  data.forEach((item) => {
    const d = new Date(item.created_at);
    const key =
      mode === "monthly"
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const row = index.get(key);
    if (!row) return;
    if (item.type === "expense") row.expense += Number(item.total);
    else row.income += Number(item.total);
    row.count += 1;
  });

  return rows;
}

function modeClass(active: boolean) {
  return `rounded-lg px-4 py-2 text-sm font-semibold transition ${
    active
      ? "bg-white text-slate-900 shadow-sm"
      : "text-slate-500 hover:text-slate-700"
  }`;
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "emerald" | "rose" | "sky" | "amber";
}) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
    sky: "bg-sky-50 text-sky-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <div className="card p-4 sm:p-5">
      <div
        className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}
      >
        {icon}
      </div>
      <p className="text-xs font-medium text-slate-500 sm:text-sm">{label}</p>
      <p className="mt-1 truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
        {value}
      </p>
    </div>
  );
}
