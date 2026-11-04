"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Banknote,
  Loader2,
  Plus,
  ReceiptText,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { SalesChart } from "@/components/sales-chart";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/error";
import {
  endOfDay,
  formatDateTime,
  formatRupiah,
  startOfDay,
} from "@/lib/format";
import type { Transaction } from "@/lib/types";

interface Summary {
  sales: number;
  manualIncome: number;
  expense: number;
  cashIn: number;
  count: number;
}

interface LedgerRow {
  kind: string;
  amount: number;
  transaction_id: number | null;
  created_at: string;
}

const EMPTY_SUMMARY: Summary = {
  sales: 0,
  manualIncome: 0,
  expense: 0,
  cashIn: 0,
  count: 0,
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState<Summary>(EMPTY_SUMMARY);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [chart, setChart] = useState<{ labels: string[]; values: number[] }>({
    labels: [],
    values: [],
  });
  const [name, setName] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, email")
            .eq("id", user.id)
            .single();
          if (active) {
            setName(profile?.full_name || profile?.email || "");
          }
        }

        const now = new Date();
        const dayStart = startOfDay(now).toISOString();
        const dayEnd = endOfDay(now).toISOString();

        const [todayRes, ledgerRes] = await Promise.all([
          supabase
            .from("transactions")
            .select(
              "id, type, total, payment_method, category, note, cashier_name, cash_received, change_amount, created_at",
            )
            .gte("created_at", dayStart)
            .lte("created_at", dayEnd)
            .order("created_at", { ascending: false }),
          supabase
            .from("customer_ledger")
            .select("kind, amount, transaction_id, created_at")
            .gte("created_at", dayStart)
            .lte("created_at", dayEnd),
        ]);

        if (todayRes.error) throw todayRes.error;
        if (ledgerRes.error) throw ledgerRes.error;

        const rows = (todayRes.data ?? []) as Transaction[];
        const summary = rows.reduce<Summary>(
          (acc, row) => {
            const total = Number(row.total);
            if (row.type === "expense") {
              acc.expense += total;
            } else if (row.type === "income") {
              acc.manualIncome += total;
              acc.cashIn += total;
            } else {
              acc.sales += total;
              acc.cashIn +=
                Number(row.cash_received ?? row.total) -
                Number(row.change_amount ?? 0);
            }
            acc.count += 1;
            return acc;
          },
          { ...EMPTY_SUMMARY },
        );

        (ledgerRes.data ?? []).forEach((entry) => {
          const ledger = entry as LedgerRow;
          if (ledger.transaction_id) return;
          const amount = Number(ledger.amount);
          if (ledger.kind === "debt_payment" || ledger.kind === "deposit_add") {
            summary.cashIn += amount;
          } else if (ledger.kind === "deposit_refund") {
            summary.cashIn -= amount;
          }
        });

        const weekStart = startOfDay(
          new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
        ).toISOString();

        const { data: weekRows, error: weekError } = await supabase
          .from("transactions")
          .select("type, total, created_at")
          .gte("created_at", weekStart)
          .order("created_at", { ascending: true });

        if (weekError) throw weekError;

        const dayKeys: string[] = [];
        const dayLabels: string[] = [];
        for (let i = 6; i >= 0; i -= 1) {
          const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          dayKeys.push(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
          dayLabels.push(
            new Intl.DateTimeFormat("id-ID", {
              day: "numeric",
              month: "short",
            }).format(d),
          );
        }

        const totals = new Map<string, number>();
        (weekRows ?? []).forEach((row) => {
          const r = row as {
            type: string;
            total: number;
            created_at: string;
          };
          if (r.type !== "sale") return;
          const d = new Date(r.created_at);
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          totals.set(key, (totals.get(key) ?? 0) + Number(r.total));
        });

        if (active) {
          setToday(summary);
          setRecent(rows.slice(0, 6));
          setChart({
            labels: dayLabels,
            values: dayKeys.map((key) => totals.get(key) ?? 0),
          });
        }
      } catch (err) {
        if (active) {
          setError(getErrorMessage(err, "Gagal memuat data dashboard."));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  const profit = today.sales + today.manualIncome - today.expense;
  const greeting = getGreeting();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-600">{greeting}</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">
            {name ? `Halo, ${name}` : "Dashboard"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Ringkasan usaha Anda hari ini.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/pos" className="btn-primary">
            <ShoppingCart className="h-4 w-4" />
            Buka Kasir
          </Link>
          <Link href="/transactions/new" className="btn-secondary">
            <Plus className="h-4 w-4" />
            Catat Manual
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        <SummaryCard
          label="Penjualan hari ini"
          value={formatRupiah(today.sales)}
          icon={<ShoppingCart className="h-5 w-5" />}
          tone="emerald"
          loading={loading}
        />
        <SummaryCard
          label="Kas masuk hari ini"
          value={formatRupiah(today.cashIn)}
          icon={<Banknote className="h-5 w-5" />}
          tone="sky"
          loading={loading}
        />
        <SummaryCard
          label="Pengeluaran hari ini"
          value={formatRupiah(today.expense)}
          icon={<ArrowUpRight className="h-5 w-5" />}
          tone="rose"
          loading={loading}
        />
        <SummaryCard
          label="Laba hari ini"
          value={formatRupiah(profit)}
          icon={<TrendingUp className="h-5 w-5" />}
          tone="amber"
          loading={loading}
        />
        <SummaryCard
          label="Jumlah transaksi"
          value={String(today.count)}
          icon={<ReceiptText className="h-5 w-5" />}
          tone="slate"
          loading={loading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="card card-pad lg:col-span-3">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Penjualan 7 hari terakhir
              </h2>
              <p className="text-sm text-slate-500">
                Total penjualan harian
              </p>
            </div>
            <Wallet className="h-5 w-5 text-slate-300" />
          </div>
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
            </div>
          ) : (
            <SalesChart labels={chart.labels} values={chart.values} />
          )}
        </div>

        <div className="card card-pad lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              Transaksi terbaru
            </h2>
            <Link
              href="/transactions"
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
            >
              Lihat semua
            </Link>
          </div>

          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
            </div>
          ) : recent.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center text-center">
              <ReceiptText className="h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">
                Belum ada transaksi hari ini.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.map((tx) => (
                <li key={tx.id} className="flex items-center gap-3 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <ReceiptText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {labelForTransaction(tx)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatDateTime(tx.created_at)}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold ${
                      tx.type === "expense" ? "text-rose-600" : "text-emerald-600"
                    }`}
                  >
                    {tx.type === "expense" ? "-" : "+"}
                    {formatRupiah(tx.total)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
  loading,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "emerald" | "rose" | "sky" | "amber" | "slate";
  loading: boolean;
}) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
    sky: "bg-sky-50 text-sky-600",
    amber: "bg-amber-50 text-amber-600",
    slate: "bg-slate-100 text-slate-600",
  };

  return (
    <div className="card p-4 sm:p-5">
      <div
        className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}
      >
        {icon}
      </div>
      <p className="text-xs font-medium text-slate-500 sm:text-sm">{label}</p>
      {loading ? (
        <div className="mt-1 h-7 w-24 animate-pulse rounded bg-slate-100" />
      ) : (
        <p className="mt-1 truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
          {value}
        </p>
      )}
    </div>
  );
}

function labelForTransaction(tx: Transaction) {
  if (tx.type === "sale") {
    return tx.payment_method === "qris" ? "Penjualan (QRIS)" : "Penjualan (Tunai)";
  }
  if (tx.type === "expense") {
    return tx.category ? `Pengeluaran · ${tx.category}` : "Pengeluaran";
  }
  return tx.category ? `Pemasukan · ${tx.category}` : "Pemasukan";
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 19) return "Selamat sore";
  return "Selamat malam";
}
