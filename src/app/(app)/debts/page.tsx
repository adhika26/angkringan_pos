"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  History,
  Loader2,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Wallet,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/error";
import { formatDateTime, formatRupiah } from "@/lib/format";
import type {
  AdjustmentAccount,
  AdjustmentDirection,
  Customer,
  CustomerAccount,
  CustomerLedgerEntry,
  CustomerLedgerKind,
} from "@/lib/types";

type AccountRow = CustomerAccount & {
  customers?: Customer | Customer[] | null;
};

type Tab = "debt" | "deposit";
type DepositMode = "add" | "refund";

export default function DebtsPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("debt");
  const [search, setSearch] = useState("");
  const [showPaid, setShowPaid] = useState(false);
  const [payTarget, setPayTarget] = useState<AccountRow | null>(null);
  const [depositTarget, setDepositTarget] = useState<{
    row: AccountRow;
    mode: DepositMode;
  } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<AccountRow | null>(null);
  const [addDepositOpen, setAddDepositOpen] = useState(false);
  const [addDebtOpen, setAddDebtOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<AccountRow | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<AccountRow | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("customer_accounts")
          .select(
            "customer_id, debt_balance, deposit_balance, updated_at, customers(id, name, phone)",
          )
          .order("updated_at", { ascending: false });

        if (error) throw error;
        if (active) setAccounts((data ?? []) as unknown as AccountRow[]);
      } catch (err) {
        if (active) {
          setError(getErrorMessage(err, "Gagal memuat data hutang."));
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
    let debt = 0;
    let deposit = 0;
    accounts.forEach((row) => {
      debt += Number(row.debt_balance);
      deposit += Number(row.deposit_balance);
    });
    return { debt, deposit };
  }, [accounts]);

  const debtCount = accounts.filter((row) => Number(row.debt_balance) > 0).length;
  const depositCount = accounts.filter(
    (row) => Number(row.deposit_balance) > 0,
  ).length;

  const visible = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return accounts
      .filter((row) => {
        const name = customerName(row).toLowerCase();
        if (keyword && !name.includes(keyword)) return false;
        const balance =
          tab === "debt"
            ? Number(row.debt_balance)
            : Number(row.deposit_balance);
        return balance > 0 || showPaid;
      })
      .sort((a, b) => {
        const aBalance =
          tab === "debt" ? Number(a.debt_balance) : Number(a.deposit_balance);
        const bBalance =
          tab === "debt" ? Number(b.debt_balance) : Number(b.deposit_balance);
        if (aBalance > 0 && bBalance <= 0) return -1;
        if (aBalance <= 0 && bBalance > 0) return 1;
        return customerName(a).localeCompare(customerName(b), "id");
      });
  }, [accounts, search, tab, showPaid]);

  function refresh() {
    setRefreshKey((key) => key + 1);
  }

  function closeModals() {
    setPayTarget(null);
    setDepositTarget(null);
    setHistoryTarget(null);
    setAddDepositOpen(false);
    setAddDebtOpen(false);
    setRenameTarget(null);
    setAdjustTarget(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Hutang Pelanggan
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Catat hutang pelanggan dan deposit, lengkap dengan riwayat.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAddDebtOpen(true)}
            className="btn-secondary"
          >
            <Plus className="h-4 w-4" />
            Tambah Hutang
          </button>
          <button
            type="button"
            onClick={() => setAddDepositOpen(true)}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" />
            Tambah Deposit
          </button>
        </div>
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
            Total hutang pelanggan
          </p>
          <p className="mt-1 truncate text-lg font-bold text-slate-900 sm:text-xl">
            {formatRupiah(summary.debt)}
          </p>
        </div>
        <div className="card p-4 sm:p-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <ArrowDownLeft className="h-5 w-5" />
          </div>
          <p className="text-xs font-medium text-slate-500 sm:text-sm">
            Total deposit pelanggan
          </p>
          <p className="mt-1 truncate text-lg font-bold text-slate-900 sm:text-xl">
            {formatRupiah(summary.deposit)}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setTab("debt")}
            className={tabClass(tab === "debt")}
          >
            Hutang ({debtCount})
          </button>
          <button
            type="button"
            onClick={() => setTab("deposit")}
            className={tabClass(tab === "deposit")}
          >
            Deposit ({depositCount})
          </button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showPaid}
              onChange={(e) => setShowPaid(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            Tampilkan riwayat lunas
          </label>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama pelanggan..."
              className="input pl-10"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
        </div>
      ) : visible.length === 0 ? (
        <div className="card flex h-56 flex-col items-center justify-center text-center">
          <Wallet className="h-10 w-10 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-600">
            Belum ada data
          </p>
          <p className="text-xs text-slate-400">
            {tab === "debt"
              ? "Hutang pelanggan akan muncul otomatis dari transaksi kasir."
              : "Tambahkan deposit pelanggan untuk mulai mencatat saldo."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((row) => {
            const name = customerName(row);
            const balance =
              tab === "debt"
                ? Number(row.debt_balance)
                : Number(row.deposit_balance);
            const settled = balance <= 0;

            return (
              <div key={row.customer_id} className="card overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-base font-semibold text-slate-900">
                        {name}
                      </p>
                      {settled ? (
                        <span className="badge bg-emerald-100 text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          {tab === "debt" ? "Lunas" : "Tidak ada deposit"}
                        </span>
                      ) : tab === "debt" ? (
                        <span className="badge bg-rose-100 text-rose-700">
                          Belum lunas
                        </span>
                      ) : (
                        <span className="badge bg-emerald-100 text-emerald-700">
                          Deposit aktif
                        </span>
                      )}
                    </div>
                    {row.updated_at && (
                      <p className="mt-1 text-xs text-slate-400">
                        Diperbarui {formatDateTime(row.updated_at)}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">
                      {tab === "debt" ? "Sisa hutang" : "Saldo deposit"}
                    </p>
                    <p
                      className={`text-lg font-bold ${
                        tab === "debt"
                          ? balance > 0
                            ? "text-rose-600"
                            : "text-emerald-600"
                          : balance > 0
                            ? "text-emerald-600"
                            : "text-slate-400"
                      }`}
                    >
                      {formatRupiah(balance)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
                  {tab === "debt" && balance > 0 && (
                    <button
                      type="button"
                      onClick={() => setPayTarget(row)}
                      className="btn-primary px-3 py-2 text-xs"
                    >
                      <Wallet className="h-3.5 w-3.5" />
                      Bayar
                    </button>
                  )}
                  {tab === "deposit" && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setDepositTarget({ row, mode: "add" })
                        }
                        className="btn-primary px-3 py-2 text-xs"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Tambah
                      </button>
                      {balance > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setDepositTarget({ row, mode: "refund" })
                          }
                          className="btn-secondary px-3 py-2 text-xs"
                        >
                          <ArrowDownLeft className="h-3.5 w-3.5" />
                          Tarik
                        </button>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setRenameTarget(row)}
                    className="btn-secondary px-3 py-2 text-xs"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit Nama
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustTarget(row)}
                    className="btn-secondary px-3 py-2 text-xs"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Koreksi
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryTarget(row)}
                    className="btn-secondary px-3 py-2 text-xs"
                  >
                    <History className="h-3.5 w-3.5" />
                    Riwayat
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {payTarget && (
        <PayDebtModal
          row={payTarget}
          onClose={closeModals}
          onSaved={() => {
            closeModals();
            refresh();
          }}
        />
      )}

      {depositTarget && (
        <DepositModal
          row={depositTarget.row}
          mode={depositTarget.mode}
          onClose={closeModals}
          onSaved={() => {
            closeModals();
            refresh();
          }}
        />
      )}

      {historyTarget && (
        <HistoryModal row={historyTarget} onClose={closeModals} />
      )}

      {addDepositOpen && (
        <AddDepositModal
          accounts={accounts}
          onClose={closeModals}
          onSaved={() => {
            closeModals();
            refresh();
          }}
        />
      )}

      {addDebtOpen && (
        <AddDebtModal
          accounts={accounts}
          onClose={closeModals}
          onSaved={() => {
            closeModals();
            refresh();
          }}
        />
      )}

      {renameTarget && (
        <RenameCustomerModal
          row={renameTarget}
          accounts={accounts}
          onClose={closeModals}
          onSaved={() => {
            closeModals();
            refresh();
          }}
        />
      )}

      {adjustTarget && (
        <AdjustModal
          row={adjustTarget}
          defaultAccount={tab}
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

function customerName(row: AccountRow) {
  const customer = row.customers;
  if (Array.isArray(customer)) return customer[0]?.name ?? "Tanpa nama";
  return customer?.name ?? "Tanpa nama";
}

function PayDebtModal({
  row,
  onClose,
  onSaved,
}: {
  row: AccountRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const balance = Number(row.debt_balance);
  const [amount, setAmount] = useState(String(balance));
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
    if (value > balance) {
      return setError("Nominal melebihi sisa hutang.");
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("pay_customer_debt", {
        p_customer_id: row.customer_id,
        p_amount: value,
        p_note: note.trim() || null,
      });
      if (error) throw error;
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, "Gagal menyimpan pembayaran."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Bayar Hutang" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <p className="font-semibold text-slate-800">{customerName(row)}</p>
          <p className="mt-0.5 text-slate-500">
            Sisa hutang: {formatRupiah(balance)}
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
            max={balance}
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
            placeholder="Contoh: bayar sebagian"
          />
        </div>

        {error && <ErrorBox message={error} />}

        <ModalActions
          saving={saving}
          onCancel={onClose}
          label={Number(amount) >= balance ? "Lunasi" : "Simpan pembayaran"}
        />
      </form>
    </ModalShell>
  );
}

function DepositModal({
  row,
  mode,
  onClose,
  onSaved,
}: {
  row: AccountRow;
  mode: DepositMode;
  onClose: () => void;
  onSaved: () => void;
}) {
  const balance = Number(row.deposit_balance);
  const debt = Number(row.debt_balance);
  const [amount, setAmount] = useState(mode === "refund" ? String(balance) : "");
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
    if (mode === "refund" && value > balance) {
      return setError("Nominal melebihi saldo deposit.");
    }
    if (mode === "add" && debt > 0) {
      return setError("Lunasi hutang pelanggan terlebih dahulu.");
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc(
        mode === "add" ? "add_customer_deposit" : "refund_customer_deposit",
        {
          p_customer_id: row.customer_id,
          p_amount: value,
          p_note: note.trim() || null,
        },
      );
      if (error) throw error;
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, "Gagal menyimpan deposit."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={mode === "add" ? "Tambah Deposit" : "Tarik Deposit"}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <p className="font-semibold text-slate-800">{customerName(row)}</p>
          <p className="mt-0.5 text-slate-500">
            Saldo deposit: {formatRupiah(balance)}
          </p>
          {debt > 0 && (
            <p className="mt-1 text-xs font-medium text-rose-600">
              Pelanggan masih punya hutang {formatRupiah(debt)}.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="depositAmount" className="label">
            Nominal (Rp)
          </label>
          <input
            id="depositAmount"
            type="number"
            min={1}
            max={mode === "refund" ? balance : undefined}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input font-semibold"
            placeholder="Contoh: 10000"
          />
        </div>

        <div>
          <label htmlFor="depositNote" className="label">
            Catatan (opsional)
          </label>
          <input
            id="depositNote"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="input"
            placeholder={
              mode === "add" ? "Contoh: titip uang untuk besok" : "Contoh: sisa deposit diambil"
            }
          />
        </div>

        {error && <ErrorBox message={error} />}

        <ModalActions
          saving={saving}
          onCancel={onClose}
          label={mode === "add" ? "Simpan deposit" : "Tarik deposit"}
        />
      </form>
    </ModalShell>
  );
}

function AddDepositModal({
  accounts,
  onClose,
  onSaved,
}: {
  accounts: AccountRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    const value = Number(amount);

    if (!trimmed) return setError("Nama pelanggan wajib diisi.");
    if (!Number.isFinite(value) || value <= 0) {
      return setError("Nominal harus lebih dari 0.");
    }

    const existing = accounts.find(
      (row) => customerName(row).trim().toLowerCase() === trimmed.toLowerCase(),
    );

    if (existing && Number(existing.debt_balance) > 0) {
      return setError(
        `Pelanggan masih punya hutang ${formatRupiah(existing.debt_balance)}. Lunasi dulu.`,
      );
    }

    setSaving(true);
    try {
      const supabase = createClient();
      let customerId = existing?.customer_id;

      if (!customerId) {
        const { data, error } = await supabase.rpc("ensure_customer", {
          p_name: trimmed,
        });
        if (error) throw error;
        customerId = Number(data);
      }

      if (!customerId) {
        throw new Error("Gagal membuat pelanggan.");
      }

      const { error } = await supabase.rpc("add_customer_deposit", {
        p_customer_id: customerId,
        p_amount: value,
        p_note: note.trim() || null,
      });
      if (error) throw error;

      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, "Gagal menyimpan deposit."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Tambah Deposit" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="depositCustomer" className="label">
            Nama pelanggan
          </label>
          <input
            id="depositCustomer"
            type="text"
            list="deposit-customer-options"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="Cari atau ketik nama pelanggan"
          />
          <datalist id="deposit-customer-options">
            {accounts.map((row) => (
              <option key={row.customer_id} value={customerName(row)} />
            ))}
          </datalist>
        </div>

        <div>
          <label htmlFor="newDepositAmount" className="label">
            Nominal deposit (Rp)
          </label>
          <input
            id="newDepositAmount"
            type="number"
            min={1}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input font-semibold"
            placeholder="Contoh: 10000"
          />
        </div>

        <div>
          <label htmlFor="newDepositNote" className="label">
            Catatan (opsional)
          </label>
          <input
            id="newDepositNote"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="input"
            placeholder="Contoh: titip uang untuk besok"
          />
        </div>

        {error && <ErrorBox message={error} />}

        <ModalActions saving={saving} onCancel={onClose} label="Simpan deposit" />
      </form>
    </ModalShell>
  );
}

function AddDebtModal({
  accounts,
  onClose,
  onSaved,
}: {
  accounts: AccountRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    const value = Number(amount);

    if (!trimmed) return setError("Nama pelanggan wajib diisi.");
    if (!Number.isFinite(value) || value <= 0) {
      return setError("Nominal harus lebih dari 0.");
    }

    const existing = accounts.find(
      (row) => customerName(row).trim().toLowerCase() === trimmed.toLowerCase(),
    );

    if (existing && Number(existing.deposit_balance) > 0) {
      return setError(
        `Pelanggan masih punya deposit ${formatRupiah(existing.deposit_balance)}. Tarik deposit dulu.`,
      );
    }

    setSaving(true);
    try {
      const supabase = createClient();
      let customerId = existing?.customer_id;

      if (!customerId) {
        const { data, error } = await supabase.rpc("ensure_customer", {
          p_name: trimmed,
        });
        if (error) throw error;
        customerId = Number(data);
      }

      if (!customerId) {
        throw new Error("Gagal membuat pelanggan.");
      }

      const { error } = await supabase.rpc("add_customer_debt", {
        p_customer_id: customerId,
        p_amount: value,
        p_note: note.trim() || null,
      });
      if (error) throw error;

      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, "Gagal menyimpan hutang."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Tambah Hutang Manual" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="debtCustomer" className="label">
            Nama pelanggan
          </label>
          <input
            id="debtCustomer"
            type="text"
            list="debt-customer-options"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="Cari atau ketik nama pelanggan"
          />
          <datalist id="debt-customer-options">
            {accounts.map((row) => (
              <option key={row.customer_id} value={customerName(row)} />
            ))}
          </datalist>
        </div>

        <div>
          <label htmlFor="manualDebtAmount" className="label">
            Nominal hutang (Rp)
          </label>
          <input
            id="manualDebtAmount"
            type="number"
            min={1}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input font-semibold"
            placeholder="Contoh: 5000"
          />
        </div>

        <div>
          <label htmlFor="manualDebtNote" className="label">
            Catatan (opsional)
          </label>
          <input
            id="manualDebtNote"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="input"
            placeholder="Contoh: hutang lama sebelum aplikasi"
          />
        </div>

        {error && <ErrorBox message={error} />}

        <ModalActions saving={saving} onCancel={onClose} label="Simpan hutang" />
      </form>
    </ModalShell>
  );
}

function RenameCustomerModal({
  row,
  accounts,
  onClose,
  onSaved,
}: {
  row: AccountRow;
  accounts: AccountRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(customerName(row));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = accounts.find(
    (account) =>
      account.customer_id !== row.customer_id &&
      customerName(account).trim().toLowerCase() === name.trim().toLowerCase(),
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();

    if (!trimmed) return setError("Nama pelanggan wajib diisi.");

    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("rename_customer", {
        p_customer_id: row.customer_id,
        p_new_name: trimmed,
      });
      if (error) throw error;
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, "Gagal mengubah nama pelanggan."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Edit Nama Pelanggan" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <p className="font-semibold text-slate-800">{customerName(row)}</p>
          <p className="mt-0.5 text-slate-500">
            Hutang: {formatRupiah(row.debt_balance)} · Deposit:{" "}
            {formatRupiah(row.deposit_balance)}
          </p>
        </div>

        <div>
          <label htmlFor="renameCustomer" className="label">
            Nama baru
          </label>
          <input
            id="renameCustomer"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="Contoh: Rofi"
          />
        </div>

        {target && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            Nama sudah dipakai <strong>{customerName(target)}</strong>. Saldo dan
            riwayat akan digabung ke pelanggan tersebut.
          </div>
        )}

        {error && <ErrorBox message={error} />}

        <ModalActions
          saving={saving}
          onCancel={onClose}
          label={target ? "Gabung & simpan" : "Simpan nama"}
        />
      </form>
    </ModalShell>
  );
}

function AdjustModal({
  row,
  defaultAccount,
  onClose,
  onSaved,
}: {
  row: AccountRow;
  defaultAccount: AdjustmentAccount;
  onClose: () => void;
  onSaved: () => void;
}) {
  const debt = Number(row.debt_balance);
  const deposit = Number(row.deposit_balance);
  const [account, setAccount] = useState<AdjustmentAccount>(defaultAccount);
  const [direction, setDirection] = useState<AdjustmentDirection>("sub");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = account === "debt" ? debt : deposit;
  const value = Number(amount);
  const preview = Number.isFinite(value)
    ? direction === "add"
      ? current + value
      : current - value
    : current;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!Number.isFinite(value) || value <= 0) {
      return setError("Nominal harus lebih dari 0.");
    }
    if (!note.trim()) {
      return setError("Catatan koreksi wajib diisi.");
    }
    if (direction === "sub" && value > current) {
      return setError("Nominal melebihi saldo saat ini.");
    }
    if (account === "debt" && direction === "add" && deposit > 0) {
      return setError("Tarik deposit pelanggan terlebih dahulu.");
    }
    if (account === "deposit" && direction === "add" && debt > 0) {
      return setError("Lunasi hutang pelanggan terlebih dahulu.");
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("adjust_customer_account", {
        p_customer_id: row.customer_id,
        p_account: account,
        p_direction: direction,
        p_amount: value,
        p_note: note.trim(),
      });
      if (error) throw error;
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, "Gagal menyimpan koreksi."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Koreksi Saldo" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <p className="font-semibold text-slate-800">{customerName(row)}</p>
          <p className="mt-0.5 text-slate-500">
            Hutang: {formatRupiah(debt)} · Deposit: {formatRupiah(deposit)}
          </p>
        </div>

        <div>
          <p className="label">Saldo yang dikoreksi</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAccount("debt")}
              className={segmentClass(account === "debt")}
            >
              Hutang
            </button>
            <button
              type="button"
              onClick={() => setAccount("deposit")}
              className={segmentClass(account === "deposit")}
            >
              Deposit
            </button>
          </div>
        </div>

        <div>
          <p className="label">Arah koreksi</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDirection("sub")}
              className={segmentClass(direction === "sub")}
            >
              Kurangi
            </button>
            <button
              type="button"
              onClick={() => setDirection("add")}
              className={segmentClass(direction === "add")}
            >
              Tambah
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="adjustAmount" className="label">
            Nominal koreksi (Rp)
          </label>
          <input
            id="adjustAmount"
            type="number"
            min={1}
            max={direction === "sub" ? current : undefined}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input font-semibold"
            placeholder="Contoh: 9000"
          />
        </div>

        <div>
          <label htmlFor="adjustNote" className="label">
            Catatan koreksi (wajib)
          </label>
          <input
            id="adjustNote"
            type="text"
            required
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="input"
            placeholder="Contoh: salah input nominal deposit"
          />
        </div>

        <div className="space-y-1 rounded-xl bg-slate-50 px-4 py-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Saldo sekarang</span>
            <span className="font-semibold text-slate-800">
              {formatRupiah(current)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Setelah koreksi</span>
            <span
              className={`font-semibold ${
                preview < 0 ? "text-rose-600" : "text-emerald-600"
              }`}
            >
              {formatRupiah(Math.max(preview, 0))}
            </span>
          </div>
        </div>

        {error && <ErrorBox message={error} />}

        <ModalActions saving={saving} onCancel={onClose} label="Simpan koreksi" />
      </form>
    </ModalShell>
  );
}

function HistoryModal({
  row,
  onClose,
}: {
  row: AccountRow;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<CustomerLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("customer_ledger")
          .select("id, customer_id, kind, amount, transaction_id, note, created_at")
          .eq("customer_id", row.customer_id)
          .order("created_at", { ascending: false });

        if (error) throw error;
        if (active) setEntries((data ?? []) as CustomerLedgerEntry[]);
      } catch (err) {
        if (active) {
          setError(getErrorMessage(err, "Gagal memuat riwayat."));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [row.customer_id]);

  return (
    <ModalShell title={`Riwayat · ${customerName(row)}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-sm">
          <div>
            <p className="text-xs text-slate-500">Hutang</p>
            <p className="font-semibold text-rose-600">
              {formatRupiah(row.debt_balance)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Deposit</p>
            <p className="font-semibold text-emerald-600">
              {formatRupiah(row.deposit_balance)}
            </p>
          </div>
        </div>

        {error && <ErrorBox message={error} />}

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
          </div>
        ) : entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            Belum ada riwayat.
          </p>
        ) : (
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
            {entries.map((entry) => {
              const meta = ledgerMeta(entry.kind);
              return (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">{meta.label}</p>
                    <p className="text-xs text-slate-400">
                      {formatDateTime(entry.created_at)}
                      {entry.transaction_id
                        ? ` · Transaksi #${entry.transaction_id}`
                        : ""}
                    </p>
                    {entry.note && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {entry.note}
                      </p>
                    )}
                  </div>
                  <span className={`shrink-0 font-semibold ${meta.tone}`}>
                    {meta.sign}
                    {formatRupiah(entry.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </ModalShell>
  );
}

function ledgerMeta(kind: CustomerLedgerKind) {
  switch (kind) {
    case "debt_add":
      return { label: "Hutang baru", sign: "+", tone: "text-rose-600" };
    case "debt_payment":
      return { label: "Bayar hutang", sign: "-", tone: "text-emerald-600" };
    case "deposit_add":
      return { label: "Deposit masuk", sign: "+", tone: "text-emerald-600" };
    case "deposit_use":
      return { label: "Deposit dipakai", sign: "-", tone: "text-amber-600" };
    case "deposit_refund":
      return { label: "Deposit ditarik", sign: "-", tone: "text-amber-600" };
    case "debt_adjustment_add":
      return { label: "Koreksi hutang (+)", sign: "+", tone: "text-rose-600" };
    case "debt_adjustment_sub":
      return { label: "Koreksi hutang (-)", sign: "-", tone: "text-emerald-600" };
    case "deposit_adjustment_add":
      return { label: "Koreksi deposit (+)", sign: "+", tone: "text-emerald-600" };
    case "deposit_adjustment_sub":
      return { label: "Koreksi deposit (-)", sign: "-", tone: "text-amber-600" };
    default:
      return { label: "Penyesuaian", sign: "", tone: "text-slate-600" };
  }
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

function segmentClass(active: boolean) {
  return `rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
    active
      ? "border-emerald-600 bg-emerald-50 text-emerald-700"
      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
  }`;
}
