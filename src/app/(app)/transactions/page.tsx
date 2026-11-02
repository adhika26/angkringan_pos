"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Eye,
  Loader2,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  endOfDay,
  formatDateTime,
  formatRupiah,
  startOfDay,
  toDateInput,
} from "@/lib/format";
import type {
  PaymentMethod,
  Transaction,
  TransactionItem,
  TransactionType,
} from "@/lib/types";

type Row = Transaction & { transaction_items?: TransactionItem[] };

const TYPE_OPTIONS: { value: "all" | TransactionType; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "sale", label: "Penjualan" },
  { value: "income", label: "Pemasukan" },
  { value: "expense", label: "Pengeluaran" },
];

export default function TransactionsPage() {
  const now = new Date();
  const [from, setFrom] = useState(
    toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
  );
  const [to, setTo] = useState(toDateInput(now));
  const [type, setType] = useState<"all" | TransactionType>("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<"owner" | "cashier">("cashier");
  const [selected, setSelected] = useState<Row | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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

        const start = startOfDay(new Date(`${from}T00:00:00`)).toISOString();
        const end = endOfDay(new Date(`${to}T00:00:00`)).toISOString();

        let query = supabase
          .from("transactions")
          .select(
            "id, type, total, payment_method, category, note, cashier_id, cashier_name, created_at, transaction_items(id, product_name, qty, price, subtotal)",
          )
          .gte("created_at", start)
          .lte("created_at", end)
          .order("created_at", { ascending: false });

        if (type !== "all") query = query.eq("type", type);

        const { data, error } = await query;
        if (error) throw error;

        if (active) setRows((data ?? []) as unknown as Row[]);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Gagal memuat transaksi.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [from, to, type, refreshKey]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) => {
      const haystack = [
        row.category,
        row.note,
        row.cashier_name,
        ...(row.transaction_items ?? []).map((item) => item.product_name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [rows, search]);

  const summary = useMemo(() => {
    let income = 0;
    let expense = 0;
    filtered.forEach((row) => {
      if (row.type === "expense") expense += Number(row.total);
      else income += Number(row.total);
    });
    return { income, expense, net: income - expense };
  }, [filtered]);

  async function handleDelete(row: Row) {
    if (!window.confirm(`Hapus transaksi ${formatRupiah(row.total)}?`)) return;

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", row.id);
      if (error) throw error;
      setRefreshKey((key) => key + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus transaksi.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Transaksi
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Riwayat penjualan, pemasukan, dan pengeluaran.
          </p>
        </div>
        <Link href="/transactions/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          Catat Manual
        </Link>
      </div>

      <div className="card card-pad">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label htmlFor="from" className="label">
              Dari tanggal
            </label>
            <input
              id="from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label htmlFor="to" className="label">
              Sampai tanggal
            </label>
            <input
              id="to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label htmlFor="type" className="label">
              Jenis
            </label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as "all" | TransactionType)}
              className="input"
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="search" className="label">
              Cari
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Keterangan, kasir, menu..."
                className="input pl-10"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 sm:gap-3">
          <SummaryCell label="Pemasukan" value={summary.income} tone="emerald" />
          <SummaryCell label="Pengeluaran" value={summary.expense} tone="rose" />
          <SummaryCell label="Selisih" value={summary.net} tone="slate" />
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex h-56 flex-col items-center justify-center text-center">
          <ReceiptText className="h-10 w-10 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-600">
            Belum ada transaksi
          </p>
          <p className="text-xs text-slate-400">
            Coba ubah rentang tanggal atau catat transaksi baru.
          </p>
        </div>
      ) : (
        <>
          <div className="table-wrap hidden md:block">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Jenis</th>
                  <th>Keterangan</th>
                  <th>Metode</th>
                  <th>Kasir</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    <td className="whitespace-nowrap text-xs text-slate-500">
                      {formatDateTime(row.created_at)}
                    </td>
                    <td>
                      <TypeBadge type={row.type} />
                    </td>
                    <td className="max-w-[240px]">
                      <p className="truncate font-medium text-slate-800">
                        {describe(row)}
                      </p>
                      {row.note && (
                        <p className="truncate text-xs text-slate-400">
                          {row.note}
                        </p>
                      )}
                    </td>
                    <td className="text-xs uppercase text-slate-500">
                      {row.payment_method ?? "-"}
                    </td>
                    <td className="text-xs text-slate-500">
                      {row.cashier_name ?? "-"}
                    </td>
                    <td
                      className={`whitespace-nowrap text-right font-semibold ${
                        row.type === "expense"
                          ? "text-rose-600"
                          : "text-emerald-600"
                      }`}
                    >
                      {row.type === "expense" ? "-" : "+"}
                      {formatRupiah(row.total)}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setSelected(row)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          aria-label="Detail"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {role === "owner" && (
                          <button
                            type="button"
                            onClick={() => handleDelete(row)}
                            className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            aria-label="Hapus"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 md:hidden">
            {filtered.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelected(row)}
                className="card flex w-full items-center gap-3 p-4 text-left"
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    row.type === "expense"
                      ? "bg-rose-50 text-rose-600"
                      : "bg-emerald-50 text-emerald-600"
                  }`}
                >
                  {row.type === "expense" ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowDownLeft className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {describe(row)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatDateTime(row.created_at)} · {row.cashier_name ?? "-"}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-bold ${
                    row.type === "expense" ? "text-rose-600" : "text-emerald-600"
                  }`}
                >
                  {row.type === "expense" ? "-" : "+"}
                  {formatRupiah(row.total)}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Tutup"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setSelected(null)}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">
                Detail Transaksi
              </h2>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                aria-label="Tutup"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
              <div className="flex items-center justify-between">
                <TypeBadge type={selected.type} />
                <span className="text-xs text-slate-500">
                  {formatDateTime(selected.created_at)}
                </span>
              </div>

              {(selected.transaction_items?.length ?? 0) > 0 && (
                <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                  {selected.transaction_items?.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-slate-600">
                        {item.product_name} × {item.qty}
                      </span>
                      <span className="font-medium text-slate-800">
                        {formatRupiah(item.subtotal)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <dl className="space-y-2 text-sm">
                <DetailRow label="Keterangan" value={describe(selected)} />
                <DetailRow
                  label="Kategori"
                  value={selected.category ?? "-"}
                />
                <DetailRow
                  label="Metode"
                  value={paymentLabel(selected.payment_method)}
                />
                <DetailRow
                  label="Kasir"
                  value={selected.cashier_name ?? "-"}
                />
                <DetailRow label="Catatan" value={selected.note ?? "-"} />
              </dl>

              <div className="flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
                <span className="text-sm">Total</span>
                <span className="text-lg font-bold">
                  {formatRupiah(selected.total)}
                </span>
              </div>

              {role === "owner" && (
                <button
                  type="button"
                  onClick={() => {
                    handleDelete(selected);
                    setSelected(null);
                  }}
                  className="btn-danger w-full"
                >
                  <Trash2 className="h-4 w-4" />
                  Hapus transaksi
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "rose" | "slate";
}) {
  const colors = {
    emerald: "text-emerald-600",
    rose: "text-rose-600",
    slate: "text-slate-900",
  };
  return (
    <div>
      <p className="text-[11px] font-medium text-slate-500 sm:text-xs">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-bold sm:text-base ${colors[tone]}`}>
        {formatRupiah(value)}
      </p>
    </div>
  );
}

function TypeBadge({ type }: { type: TransactionType }) {
  if (type === "sale") {
    return <span className="badge bg-sky-100 text-sky-700">Penjualan</span>;
  }
  if (type === "income") {
    return <span className="badge bg-emerald-100 text-emerald-700">Pemasukan</span>;
  }
  return <span className="badge bg-rose-100 text-rose-700">Pengeluaran</span>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function describe(row: Row) {
  if (row.type === "sale") {
    const count = (row.transaction_items ?? []).reduce(
      (sum, item) => sum + item.qty,
      0,
    );
    return count > 0 ? `Penjualan (${count} item)` : "Penjualan";
  }
  if (row.category) return row.category;
  return row.type === "income" ? "Pemasukan" : "Pengeluaran";
}

function paymentLabel(method: PaymentMethod | null) {
  const labels: Record<PaymentMethod, string> = {
    cash: "Tunai",
    qris: "QRIS",
    transfer: "Transfer",
    ewallet: "E-wallet",
  };
  return method ? labels[method] : "-";
}
