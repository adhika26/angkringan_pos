"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Plus,
  Wallet,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatRupiah } from "@/lib/format";
import type { Debt, DebtDirection, DebtPayment } from "@/lib/types";

type DebtRow = Debt & { debt_payments?: DebtPayment[] };

export default function DebtsPage() {
  const [debts, setDebts] = useState<DebtRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<"owner" | "cashier">("cashier");
  const [direction, setDirection] = useState<DebtDirection>("payable");
  const [addOpen, setAddOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<DebtRow | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
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

        const { data, error } = await supabase
          .from("debts")
          .select(
            "id, direction, party_name, description, amount, paid_amount, due_date, status, created_at, debt_payments(id, debt_id, amount, note, paid_at)",
          )
          .order("created_at", { ascending: false });

        if (error) throw error;
        if (active) setDebts((data ?? []) as unknown as DebtRow[]);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Gagal memuat data hutang.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const summary = useMemo(() => {
    let payable = 0;
    let receivable = 0;
    debts.forEach((debt) => {
      const remaining = Number(debt.amount) - Number(debt.paid_amount);
      if (debt.status === "paid" || remaining <= 0) return;
      if (debt.direction === "payable") payable += remaining;
      else receivable += remaining;
    });
    return { payable, receivable };
  }, [debts]);

  const filtered = useMemo(
    () => debts.filter((debt) => debt.direction === direction),
    [debts, direction],
  );

  async function refresh() {
    setRefreshKey((key) => key + 1);
  }

  function closeModals() {
    setAddOpen(false);
    setPayTarget(null);
  }

  if (!loading && role !== "owner") {
    return (
      <div className="card card-pad">
        <h1 className="text-lg font-semibold text-slate-900">
          Hutang & Piutang
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Halaman ini hanya dapat diakses oleh owner.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Hutang & Piutang
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Catat utang ke supplier dan piutang pelanggan, termasuk cicilannya.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="btn-primary"
        >
          <Plus className="h-4 w-4" />
          Tambah Catatan
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4 sm:p-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
            <ArrowUpRight className="h-5 w-5" />
          </div>
          <p className="text-xs font-medium text-slate-500 sm:text-sm">
            Sisa utang ke supplier
          </p>
          <p className="mt-1 truncate text-lg font-bold text-slate-900 sm:text-xl">
            {formatRupiah(summary.payable)}
          </p>
        </div>
        <div className="card p-4 sm:p-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <ArrowDownLeft className="h-5 w-5" />
          </div>
          <p className="text-xs font-medium text-slate-500 sm:text-sm">
            Sisa piutang pelanggan
          </p>
          <p className="mt-1 truncate text-lg font-bold text-slate-900 sm:text-xl">
            {formatRupiah(summary.receivable)}
          </p>
        </div>
      </div>

      <div className="inline-flex rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setDirection("payable")}
          className={tabClass(direction === "payable")}
        >
          Utang (ke supplier)
        </button>
        <button
          type="button"
          onClick={() => setDirection("receivable")}
          className={tabClass(direction === "receivable")}
        >
          Piutang (pelanggan)
        </button>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex h-56 flex-col items-center justify-center text-center">
          <Wallet className="h-10 w-10 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-600">
            Belum ada catatan
          </p>
          <p className="text-xs text-slate-400">
            Tambahkan {direction === "payable" ? "utang supplier" : "piutang pelanggan"}.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((debt) => {
            const amount = Number(debt.amount);
            const paid = Number(debt.paid_amount);
            const remaining = Math.max(amount - paid, 0);
            const progress = amount > 0 ? Math.min((paid / amount) * 100, 100) : 0;
            const isOpen = expanded === debt.id;
            const payments = [...(debt.debt_payments ?? [])].sort(
              (a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime(),
            );

            return (
              <div key={debt.id} className="card overflow-hidden">
                <div className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-base font-semibold text-slate-900">
                          {debt.party_name}
                        </p>
                        {debt.status === "paid" ? (
                          <span className="badge bg-emerald-100 text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" />
                            Lunas
                          </span>
                        ) : (
                          <span className="badge bg-amber-100 text-amber-700">
                            Belum lunas
                          </span>
                        )}
                      </div>
                      {debt.description && (
                        <p className="mt-0.5 text-sm text-slate-500">
                          {debt.description}
                        </p>
                      )}
                      {debt.due_date && (
                        <p className="mt-1 text-xs text-slate-400">
                          Jatuh tempo: {formatDate(debt.due_date)}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Sisa</p>
                      <p className="text-lg font-bold text-slate-900">
                        {formatRupiah(remaining)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-1.5 flex justify-between text-xs text-slate-500">
                      <span>Dibayar {formatRupiah(paid)}</span>
                      <span>dari {formatRupiah(amount)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${
                          debt.status === "paid" ? "bg-emerald-500" : "bg-amber-500"
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {debt.status !== "paid" && (
                      <button
                        type="button"
                        onClick={() => setPayTarget(debt)}
                        className="btn-primary px-3 py-2 text-xs"
                      >
                        <Wallet className="h-3.5 w-3.5" />
                        Catat Cicilan
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : debt.id)}
                      className="btn-secondary px-3 py-2 text-xs"
                    >
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition ${isOpen ? "rotate-180" : ""}`}
                      />
                      Riwayat ({payments.length})
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
                    {payments.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        Belum ada cicilan yang dicatat.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {payments.map((payment) => (
                          <li
                            key={payment.id}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <div>
                              <p className="font-medium text-slate-700">
                                {formatRupiah(payment.amount)}
                              </p>
                              <p className="text-xs text-slate-400">
                                {formatDate(payment.paid_at)}
                                {payment.note ? ` · ${payment.note}` : ""}
                              </p>
                            </div>
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {addOpen && (
        <AddDebtModal
          onClose={closeModals}
          initialDirection={direction}
          onSaved={() => {
            closeModals();
            refresh();
          }}
        />
      )}

      {payTarget && (
        <PayDebtModal
          debt={payTarget}
          onClose={closeModals}
          onSaved={() => {
            closeModals();
            refresh();
          }}
        />
      )}
    </div>
  );
}

function AddDebtModal({
  onClose,
  onSaved,
  initialDirection,
}: {
  onClose: () => void;
  onSaved: () => void;
  initialDirection: DebtDirection;
}) {
  const [direction, setDirection] = useState<DebtDirection>(initialDirection);
  const [party, setParty] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const value = Number(amount);
    if (!party.trim()) return setError("Nama pihak wajib diisi.");
    if (!Number.isFinite(value) || value <= 0) {
      return setError("Nominal harus lebih dari 0.");
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("debts").insert({
        direction,
        party_name: party.trim(),
        description: description.trim() || null,
        amount: value,
        due_date: dueDate || null,
        created_by: user?.id ?? null,
      });

      if (error) throw error;
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan catatan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Tambah Catatan Hutang/Piutang" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <p className="label">Jenis</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDirection("payable")}
              className={toggleClass(direction === "payable", "rose")}
            >
              Utang saya
            </button>
            <button
              type="button"
              onClick={() => setDirection("receivable")}
              className={toggleClass(direction === "receivable", "emerald")}
            >
              Piutang saya
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="party" className="label">
            {direction === "payable" ? "Nama supplier" : "Nama pelanggan"}
          </label>
          <input
            id="party"
            type="text"
            required
            value={party}
            onChange={(e) => setParty(e.target.value)}
            className="input"
            placeholder={direction === "payable" ? "Contoh: Supplier Gas" : "Contoh: Pak Budi"}
          />
        </div>

        <div>
          <label htmlFor="debtAmount" className="label">
            Nominal (Rp)
          </label>
          <input
            id="debtAmount"
            type="number"
            min={1}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input"
            placeholder="Contoh: 150000"
          />
        </div>

        <div>
          <label htmlFor="dueDate" className="label">
            Jatuh tempo (opsional)
          </label>
          <input
            id="dueDate"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="input"
          />
        </div>

        <div>
          <label htmlFor="debtDesc" className="label">
            Keterangan (opsional)
          </label>
          <input
            id="debtDesc"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input"
            placeholder="Contoh: beli 2 tabung gas"
          />
        </div>

        {error && <ErrorBox message={error} />}

        <ModalActions saving={saving} onCancel={onClose} label="Simpan" />
      </form>
    </ModalShell>
  );
}

function PayDebtModal({
  debt,
  onClose,
  onSaved,
}: {
  debt: DebtRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const remaining = Number(debt.amount) - Number(debt.paid_amount);
  const [amount, setAmount] = useState(String(remaining));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      return setError("Nominal harus lebih dari 0.");
    }
    if (value > remaining) {
      return setError("Nominal melebihi sisa yang harus dibayar.");
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("pay_debt", {
        p_debt_id: debt.id,
        p_amount: value,
        p_note: note.trim() || null,
      });
      if (error) throw error;
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan cicilan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Catat Cicilan" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <p className="font-semibold text-slate-800">{debt.party_name}</p>
          <p className="mt-0.5 text-slate-500">
            Sisa: {formatRupiah(remaining)} dari {formatRupiah(debt.amount)}
          </p>
        </div>

        <div>
          <label htmlFor="payAmount" className="label">
            Nominal pembayaran (Rp)
          </label>
          <input
            id="payAmount"
            type="number"
            min={1}
            max={remaining}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input font-semibold"
          />
        </div>

        <div>
          <label htmlFor="payNote" className="label">
            Catatan (opsional)
          </label>
          <input
            id="payNote"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="input"
            placeholder="Contoh: cicilan pertama"
          />
        </div>

        {error && <ErrorBox message={error} />}

        <ModalActions saving={saving} onCancel={onClose} label="Simpan cicilan" />
      </form>
    </ModalShell>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Tutup"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ModalActions({
  saving,
  onCancel,
  label,
}: {
  saving: boolean;
  onCancel: () => void;
  label: string;
}) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button type="button" onClick={onCancel} className="btn-secondary">
        Batal
      </button>
      <button type="submit" disabled={saving} className="btn-primary">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {label}
      </button>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      {message}
    </p>
  );
}

function tabClass(active: boolean) {
  return `rounded-lg px-4 py-2 text-sm font-semibold transition ${
    active
      ? "bg-white text-slate-900 shadow-sm"
      : "text-slate-500 hover:text-slate-700"
  }`;
}

function toggleClass(active: boolean, tone: "rose" | "emerald") {
  const activeClass =
    tone === "rose"
      ? "border-rose-500 bg-rose-50 text-rose-700"
      : "border-emerald-500 bg-emerald-50 text-emerald-700";
  return `rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
    active ? activeClass : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
  }`;
}
