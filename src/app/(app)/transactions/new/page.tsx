"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/error";
import { toDateInput } from "@/lib/format";
import type { PaymentMethod, TransactionType } from "@/lib/types";

const EXPENSE_CATEGORIES = [
  "Bahan Baku",
  "Gaji Karyawan",
  "Sewa Tempat",
  "Listrik & Air",
  "Gas & Arang",
  "Transportasi",
  "Peralatan",
  "Lainnya",
];

const INCOME_CATEGORIES = [
  "Penjualan Lain",
  "Modal Usaha",
  "Pendapatan Tambahan",
  "Lainnya",
];

export default function NewTransactionPage() {
  const router = useRouter();
  const [type, setType] = useState<Exclude<TransactionType, "sale">>("expense");
  const [total, setTotal] = useState("");
  const [category, setCategory] = useState("Bahan Baku");
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(toDateInput(new Date()));
  const [time, setTime] = useState(
    new Date().toTimeString().slice(0, 5),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const categories = type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  function switchType(next: Exclude<TransactionType, "sale">) {
    setType(next);
    setCategory(next === "expense" ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0]);
    setSuccess(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const amount = Number(total);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Nominal harus lebih dari 0.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .single();

      const createdAt = new Date(`${date}T${time || "00:00"}:00`);

      const { error } = await supabase.from("transactions").insert({
        type,
        total: amount,
        payment_method: payment,
        category,
        note: note.trim() || null,
        cashier_id: user.id,
        cashier_name: profile?.full_name || profile?.email || null,
        created_at: Number.isNaN(createdAt.getTime())
          ? new Date().toISOString()
          : createdAt.toISOString(),
      });

      if (error) throw error;

      setSuccess(true);
      setTotal("");
      setNote("");
    } catch (err) {
      setError(getErrorMessage(err, "Gagal menyimpan transaksi."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link
          href="/transactions"
          className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke transaksi
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Catat Transaksi Manual
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Untuk pengeluaran operasional atau pemasukan di luar kasir.
        </p>
      </div>

      {success && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          Transaksi berhasil disimpan.
        </div>
      )}

      <form onSubmit={handleSubmit} className="card card-pad space-y-5">
        <div>
          <p className="label">Jenis transaksi</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => switchType("expense")}
              className={typeClass(type === "expense", "rose")}
            >
              <ArrowUpRight className="h-4 w-4" />
              Pengeluaran
            </button>
            <button
              type="button"
              onClick={() => switchType("income")}
              className={typeClass(type === "income", "emerald")}
            >
              <ArrowDownLeft className="h-4 w-4" />
              Pemasukan
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="total" className="label">
            Nominal (Rp)
          </label>
          <input
            id="total"
            type="number"
            min={1}
            inputMode="numeric"
            required
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            placeholder="Contoh: 25000"
            className="input text-lg font-semibold"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="category" className="label">
              Kategori
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input"
            >
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="payment" className="label">
              Metode pembayaran
            </label>
            <select
              id="payment"
              value={payment}
              onChange={(e) => setPayment(e.target.value as PaymentMethod)}
              className="input"
            >
              <option value="cash">Tunai</option>
              <option value="qris">QRIS</option>
              <option value="transfer">Transfer</option>
              <option value="ewallet">E-wallet</option>
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="date" className="label">
              Tanggal
            </label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label htmlFor="time" className="label">
              Jam
            </label>
            <input
              id="time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="input"
            />
          </div>
        </div>

        <div>
          <label htmlFor="note" className="label">
            Keterangan (opsional)
          </label>
          <textarea
            id="note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Contoh: beli gas 3 kg dan arang"
            className="input resize-none"
          />
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Link href="/transactions" className="btn-secondary">
            Batal
          </Link>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Simpan transaksi
          </button>
        </div>
      </form>
    </div>
  );
}

function typeClass(active: boolean, tone: "rose" | "emerald") {
  const activeClass =
    tone === "rose"
      ? "border-rose-500 bg-rose-50 text-rose-700"
      : "border-emerald-500 bg-emerald-50 text-emerald-700";
  return `flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition ${
    active
      ? activeClass
      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
  }`;
}
