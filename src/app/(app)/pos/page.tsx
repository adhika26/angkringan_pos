"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  Loader2,
  Minus,
  Package,
  Plus,
  QrCode,
  Search,
  ShoppingCart,
  Trash2,
  User,
  Wallet,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/error";
import { formatRupiah } from "@/lib/format";
import {
  calculateCheckout,
  type CheckoutCalculation,
} from "@/lib/payment";
import type {
  CartItem,
  Category,
  CheckoutResult,
  Customer,
  OverpaymentAction,
  PaymentMethod,
  Product,
} from "@/lib/types";

interface AccountBalance {
  debt_balance: number;
  deposit_balance: number;
}

interface CustomerCheckoutProps {
  query: string;
  onQueryChange: (value: string) => void;
  options: Customer[];
  matched: Customer | null;
  oldDebt: number;
  depositBalance: number;
  useDeposit: boolean;
  onUseDepositChange: (value: boolean) => void;
  overpaymentAction: OverpaymentAction;
  onOverpaymentActionChange: (value: OverpaymentAction) => void;
  calc: CheckoutCalculation;
}

export default function PosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<Record<number, AccountBalance>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<number | "all">("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [cashReceived, setCashReceived] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [useDeposit, setUseDeposit] = useState(true);
  const [overpaymentAction, setOverpaymentAction] =
    useState<OverpaymentAction>("change");
  const [submitting, setSubmitting] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const supabase = createClient();
        const [productsRes, categoriesRes, customersRes, accountsRes] =
          await Promise.all([
            supabase
              .from("products")
              .select("id, name, category_id, price, stock, is_active")
              .eq("is_active", true)
              .order("name", { ascending: true }),
            supabase
              .from("categories")
              .select("id, name, sort_order")
              .order("sort_order", { ascending: true }),
            supabase
              .from("customers")
              .select("id, name, phone")
              .order("name", { ascending: true }),
            supabase
              .from("customer_accounts")
              .select("customer_id, debt_balance, deposit_balance"),
          ]);

        if (productsRes.error) throw productsRes.error;
        if (categoriesRes.error) throw categoriesRes.error;
        if (customersRes.error) throw customersRes.error;
        if (accountsRes.error) throw accountsRes.error;

        if (active) {
          setProducts((productsRes.data ?? []) as Product[]);
          setCategories((categoriesRes.data ?? []) as Category[]);
          setCustomers((customersRes.data ?? []) as Customer[]);
          setAccounts(buildAccountMap(accountsRes.data));
        }
      } catch (err) {
        if (active) {
          setError(getErrorMessage(err, "Gagal memuat daftar produk."));
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

  const total = useMemo(
    () =>
      cart.reduce(
        (sum, item) => sum + Number(item.product.price) * item.qty,
        0,
      ),
    [cart],
  );

  const itemCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.qty, 0),
    [cart],
  );

  const visibleProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchCategory =
        activeCategory === "all" || product.category_id === activeCategory;
      const matchSearch = !keyword || product.name.toLowerCase().includes(keyword);
      return matchCategory && matchSearch;
    });
  }, [products, activeCategory, search]);

  const categoriesInUse = useMemo(() => {
    const used = new Set(products.map((p) => p.category_id));
    return categories.filter((c) => used.has(c.id));
  }, [products, categories]);

  const matchedCustomer = useMemo(() => {
    const key = customerQuery.trim().toLowerCase();
    if (!key) return null;
    return (
      customers.find((customer) => customer.name.trim().toLowerCase() === key) ??
      null
    );
  }, [customers, customerQuery]);

  const matchedAccount = matchedCustomer
    ? accounts[matchedCustomer.id]
    : undefined;
  const oldDebt = matchedAccount ? Number(matchedAccount.debt_balance) : 0;
  const depositBalance = matchedAccount
    ? Number(matchedAccount.deposit_balance)
    : 0;
  const hasCustomer = customerQuery.trim().length > 0;
  const cashValue = cashReceived.trim() === "" ? null : Number(cashReceived);

  const calc = useMemo(
    () =>
      calculateCheckout({
        total,
        oldDebt,
        depositBalance,
        useDeposit,
        cashReceived: cashValue,
        overpaymentAction,
        hasCustomer,
      }),
    [
      total,
      oldDebt,
      depositBalance,
      useDeposit,
      cashValue,
      overpaymentAction,
      hasCustomer,
    ],
  );

  async function refreshCustomers() {
    const supabase = createClient();
    const [customersRes, accountsRes] = await Promise.all([
      supabase
        .from("customers")
        .select("id, name, phone")
        .order("name", { ascending: true }),
      supabase
        .from("customer_accounts")
        .select("customer_id, debt_balance, deposit_balance"),
    ]);

    if (customersRes.error) throw customersRes.error;
    if (accountsRes.error) throw accountsRes.error;

    setCustomers((customersRes.data ?? []) as Customer[]);
    setAccounts(buildAccountMap(accountsRes.data));
  }

  function addToCart(product: Product) {
    setSuccess(null);
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.qty >= product.stock) return prev;
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, qty: item.qty + 1 }
            : item,
        );
      }
      if (product.stock <= 0) return prev;
      return [...prev, { product, qty: 1 }];
    });
  }

  function changeQty(productId: number, delta: number) {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id !== productId) return item;
          const nextQty = Math.min(
            Math.max(item.qty + delta, 0),
            item.product.stock,
          );
          return { ...item, qty: nextQty };
        })
        .filter((item) => item.qty > 0),
    );
  }

  function removeItem(productId: number) {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  }

  function handleCustomerChange(value: string) {
    setCustomerQuery(value);
    setSuccess(null);
    if (!value.trim()) {
      setOverpaymentAction("change");
    }
  }

  function resetCart() {
    setCart([]);
    setNote("");
    setCashReceived("");
    setPayment("cash");
  }

  async function handleCheckout() {
    if (cart.length === 0 || submitting) return;
    setError(null);

    if (calc.error) {
      setError(calc.error);
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("checkout_sale", {
        p_items: cart.map((item) => ({
          product_id: item.product.id,
          qty: item.qty,
        })),
        p_payment_method: payment,
        p_note: note.trim() || null,
        p_customer_name: customerQuery.trim() || null,
        p_cash_received: cashValue,
        p_overpayment_action: overpaymentAction,
        p_use_deposit: useDeposit && Boolean(matchedCustomer),
      });

      if (error) throw error;

      const result = data as CheckoutResult;

      setProducts((prev) =>
        prev.map((product) => {
          const sold = cart.find((item) => item.product.id === product.id);
          return sold
            ? { ...product, stock: product.stock - sold.qty }
            : product;
        }),
      );

      try {
        await refreshCustomers();
      } catch {
        // Saldo akan termuat ulang saat halaman dibuka berikutnya.
      }

      const parts = [
        `Pembayaran berhasil${result.transaction_id ? ` #${result.transaction_id}` : ""}`,
        `Total ${formatRupiah(result.total)}`,
      ];

      if (result.deposit_used > 0) {
        parts.push(`Deposit ${formatRupiah(result.deposit_used)}`);
      }
      if (result.change_amount > 0) {
        parts.push(`Kembalian ${formatRupiah(result.change_amount)}`);
      }
      if (result.debt_added > 0) {
        parts.push(`Hutang baru ${formatRupiah(result.debt_added)}`);
      }
      if (result.debt_paid > 0) {
        parts.push(`Hutang lama dibayar ${formatRupiah(result.debt_paid)}`);
      }
      if (result.deposit_added > 0) {
        parts.push(`Deposit disimpan ${formatRupiah(result.deposit_added)}`);
      }
      if (result.new_debt_balance > 0) {
        parts.push(`Sisa hutang ${formatRupiah(result.new_debt_balance)}`);
      }
      if (result.new_deposit_balance > 0) {
        parts.push(`Saldo deposit ${formatRupiah(result.new_deposit_balance)}`);
      }

      setSuccess(parts.join(" · "));
      resetCart();
      setCustomerQuery("");
      setUseDeposit(true);
      setOverpaymentAction("change");
      setCartOpen(false);
    } catch (err) {
      setError(getErrorMessage(err, "Gagal menyimpan transaksi."));
    } finally {
      setSubmitting(false);
    }
  }

  const customerCheckout: CustomerCheckoutProps = {
    query: customerQuery,
    onQueryChange: handleCustomerChange,
    options: customers,
    matched: matchedCustomer,
    oldDebt,
    depositBalance,
    useDeposit,
    onUseDepositChange: setUseDeposit,
    overpaymentAction,
    onOverpaymentActionChange: setOverpaymentAction,
    calc,
  };

  const cartBody = (
    <CartBody
      cart={cart}
      total={total}
      payment={payment}
      setPayment={setPayment}
      note={note}
      setNote={setNote}
      cashReceived={cashReceived}
      setCashReceived={setCashReceived}
      customer={customerCheckout}
      onChangeQty={changeQty}
      onRemove={removeItem}
      onCheckout={handleCheckout}
      onClear={resetCart}
      submitting={submitting}
    />
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Kasir</h1>
          <p className="mt-1 text-sm text-slate-500">
            Pilih menu, masukkan ke keranjang, lalu bayar.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari menu..."
            className="input pl-10"
          />
        </div>
      </div>

      {success && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{success}</span>
          <button
            type="button"
            onClick={() => setSuccess(null)}
            className="rounded p-0.5 text-emerald-600 hover:bg-emerald-100"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setActiveCategory("all")}
              className={chipClass(activeCategory === "all")}
            >
              Semua
            </button>
            {categoriesInUse.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategory(category.id)}
                className={chipClass(activeCategory === category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-slate-200">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
            </div>
          ) : visibleProducts.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-center">
              <Package className="h-10 w-10 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-600">
                Tidak ada produk
              </p>
              <p className="text-xs text-slate-400">
                Tambahkan produk di menu Produk.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {visibleProducts.map((product) => {
                const inCart =
                  cart.find((item) => item.product.id === product.id)?.qty ?? 0;
                const soldOut = product.stock <= 0;
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addToCart(product)}
                    disabled={soldOut}
                    className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                  >
                    {inCart > 0 && (
                      <span className="absolute right-2.5 top-2.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-xs font-bold text-white">
                        {inCart}
                      </span>
                    )}
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                      <Package className="h-5 w-5" />
                    </div>
                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-800">
                      {product.name}
                    </p>
                    <p className="mt-1 text-sm font-bold text-emerald-600">
                      {formatRupiah(product.price)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {soldOut ? "Stok habis" : `Stok ${product.stock}`}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="hidden lg:block">
          <div className="card sticky top-8 flex max-h-[calc(100dvh-4rem)] flex-col overflow-hidden">
            <CartHeader itemCount={itemCount} />
            <div className="flex-1 overflow-y-auto">{cartBody}</div>
          </div>
        </div>
      </div>

      {itemCount > 0 && (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed inset-x-4 bottom-[4.5rem] z-20 flex items-center justify-between rounded-2xl bg-emerald-600 px-5 py-3.5 text-white shadow-lg shadow-emerald-600/30 lg:hidden"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingCart className="h-5 w-5" />
            {itemCount} item
          </span>
          <span className="text-sm font-bold">{formatRupiah(total)}</span>
        </button>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden">
          <button
            type="button"
            aria-label="Tutup keranjang"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setCartOpen(false)}
          />
          <div className="relative flex max-h-[88dvh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <CartHeader itemCount={itemCount} compact />
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Tutup"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{cartBody}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function buildAccountMap(
  rows:
    | {
        customer_id: number;
        debt_balance: number;
        deposit_balance: number;
      }[]
    | null,
) {
  return Object.fromEntries(
    (rows ?? []).map((row) => [
      row.customer_id,
      {
        debt_balance: Number(row.debt_balance),
        deposit_balance: Number(row.deposit_balance),
      },
    ]),
  ) as Record<number, AccountBalance>;
}

function chipClass(active: boolean) {
  return `shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
    active
      ? "bg-emerald-600 text-white shadow-sm"
      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
  }`;
}

function CartHeader({
  itemCount,
  compact = false,
}: {
  itemCount: number;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "" : "border-b border-slate-100 px-5 py-4"}>
      <div className="flex items-center gap-2">
        <ShoppingCart className="h-5 w-5 text-emerald-600" />
        <h2 className="text-base font-semibold text-slate-900">Keranjang</h2>
        <span className="badge bg-slate-100 text-slate-600">{itemCount} item</span>
      </div>
    </div>
  );
}

function CartBody({
  cart,
  total,
  payment,
  setPayment,
  note,
  setNote,
  cashReceived,
  setCashReceived,
  customer,
  onChangeQty,
  onRemove,
  onCheckout,
  onClear,
  submitting,
}: {
  cart: CartItem[];
  total: number;
  payment: PaymentMethod;
  setPayment: (method: PaymentMethod) => void;
  note: string;
  setNote: (value: string) => void;
  cashReceived: string;
  setCashReceived: (value: string) => void;
  customer: CustomerCheckoutProps;
  onChangeQty: (productId: number, delta: number) => void;
  onRemove: (productId: number) => void;
  onCheckout: () => void;
  onClear: () => void;
  submitting: boolean;
}) {
  const { calc } = customer;
  const kekurangan = Math.max(calc.totalObligation - calc.cashReceived, 0);
  const kelebihan = Math.max(calc.cashReceived - calc.totalObligation, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 px-5 py-4">
        <div>
          <label htmlFor="customerName" className="label">
            Pelanggan (opsional)
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="customerName"
              type="text"
              list="customer-options"
              value={customer.query}
              onChange={(e) => customer.onQueryChange(e.target.value)}
              placeholder="Cari atau ketik nama pelanggan..."
              className="input pl-10"
            />
            <datalist id="customer-options">
              {customer.options.map((option) => (
                <option key={option.id} value={option.name} />
              ))}
            </datalist>
          </div>
          {customer.matched ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {customer.oldDebt > 0 && (
                <span className="badge bg-rose-50 text-rose-700">
                  Hutang {formatRupiah(customer.oldDebt)}
                </span>
              )}
              {customer.depositBalance > 0 && (
                <span className="badge bg-emerald-50 text-emerald-700">
                  Deposit {formatRupiah(customer.depositBalance)}
                </span>
              )}
              {customer.oldDebt <= 0 && customer.depositBalance <= 0 && (
                <span className="text-xs text-slate-400">
                  Tidak ada hutang atau deposit.
                </span>
              )}
            </div>
          ) : customer.query.trim() ? (
            <p className="mt-1.5 text-xs text-slate-500">
              Pelanggan baru akan dibuat saat transaksi disimpan.
            </p>
          ) : null}
        </div>

        {cart.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center text-center">
            <ShoppingCart className="h-9 w-9 text-slate-200" />
            <p className="mt-2 text-sm text-slate-500">Keranjang masih kosong</p>
            <p className="text-xs text-slate-400">Pilih menu di sebelah kiri.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {cart.map((item) => (
              <div key={item.product.id} className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {item.product.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatRupiah(item.product.price)} × {item.qty}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onChangeQty(item.product.id, -1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                    aria-label="Kurangi"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold text-slate-800">
                    {item.qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChangeQty(item.product.id, 1)}
                    disabled={item.qty >= item.product.stock}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    aria-label="Tambah"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(item.product.id)}
                    className="ml-1 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label="Hapus"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3 border-t border-slate-100 px-5 py-4">
        <div>
          <p className="label">Metode pembayaran</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPayment("cash")}
              className={payClass(payment === "cash")}
            >
              <Banknote className="h-4 w-4" />
              Tunai
            </button>
            <button
              type="button"
              onClick={() => setPayment("qris")}
              className={payClass(payment === "qris")}
            >
              <QrCode className="h-4 w-4" />
              QRIS
            </button>
          </div>
        </div>

        {customer.matched && customer.depositBalance > 0 && (
          <label className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-800">
            <input
              type="checkbox"
              checked={customer.useDeposit}
              onChange={(e) => customer.onUseDepositChange(e.target.checked)}
              className="h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
            />
            Gunakan deposit ({formatRupiah(customer.depositBalance)})
          </label>
        )}

        <div>
          <label htmlFor="cashReceived" className="label">
            Uang diterima / nominal dibayar
          </label>
          <input
            id="cashReceived"
            type="number"
            min={0}
            inputMode="numeric"
            value={cashReceived}
            onChange={(e) => setCashReceived(e.target.value)}
            placeholder="Kosongkan jika uang pas"
            className="input"
          />
        </div>

        <div className="space-y-1.5 rounded-xl bg-slate-50 px-4 py-3 text-sm">
          <SummaryRow label="Total belanja" value={formatRupiah(total)} />
          {calc.depositUsed > 0 && (
            <SummaryRow
              label="Deposit dipakai"
              value={`- ${formatRupiah(calc.depositUsed)}`}
              tone="emerald"
            />
          )}
          {customer.oldDebt > 0 && (
            <SummaryRow
              label="Hutang lama"
              value={formatRupiah(customer.oldDebt)}
              tone="rose"
            />
          )}
          {(customer.oldDebt > 0 || calc.depositUsed > 0) && (
            <SummaryRow
              label="Total kewajiban"
              value={formatRupiah(calc.totalObligation)}
              bold
            />
          )}
          <SummaryRow
            label={
              cashReceived.trim() === ""
                ? "Uang diterima (pas belanja)"
                : "Uang diterima"
            }
            value={formatRupiah(calc.cashReceived)}
          />
          {kekurangan > 0 && (
            <SummaryRow
              label="Kekurangan"
              value={formatRupiah(kekurangan)}
              tone="amber"
              bold
            />
          )}
          {kelebihan > 0 && (
            <SummaryRow
              label="Kelebihan"
              value={formatRupiah(kelebihan)}
              tone="sky"
              bold
            />
          )}
          {calc.change > 0 && (
            <SummaryRow
              label="Kembalian"
              value={formatRupiah(calc.change)}
              tone="emerald"
              bold
            />
          )}
          {calc.depositAdded > 0 && (
            <SummaryRow
              label="Deposit disimpan"
              value={formatRupiah(calc.depositAdded)}
              tone="emerald"
              bold
            />
          )}
          {calc.debtPaid > 0 && (
            <SummaryRow
              label="Hutang lama dibayar"
              value={formatRupiah(calc.debtPaid)}
              tone="emerald"
            />
          )}
          {customer.query.trim() && (
            <SummaryRow
              label="Hutang setelah transaksi"
              value={formatRupiah(calc.newDebt)}
              tone={calc.newDebt > 0 ? "rose" : "emerald"}
              bold
            />
          )}
        </div>

        {kelebihan > 0 && (
          <div>
            <p className="label">Kelebihan uang</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => customer.onOverpaymentActionChange("change")}
                className={overpayClass(customer.overpaymentAction === "change")}
              >
                Kembalikan
              </button>
              <button
                type="button"
                onClick={() => customer.onOverpaymentActionChange("deposit")}
                disabled={!customer.query.trim()}
                className={overpayClass(
                  customer.overpaymentAction === "deposit",
                )}
              >
                <Wallet className="h-4 w-4" />
                Simpan deposit
              </button>
            </div>
            {!customer.query.trim() && (
              <p className="mt-1.5 text-xs text-amber-600">
                Isi nama pelanggan untuk menyimpan kelebihan sebagai deposit.
              </p>
            )}
          </div>
        )}

        {calc.error && (
          <p className="text-xs font-medium text-rose-600">{calc.error}</p>
        )}

        <div>
          <label htmlFor="saleNote" className="label">
            Catatan (opsional)
          </label>
          <input
            id="saleNote"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nama pelanggan, meja, dll."
            className="input"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClear}
            disabled={cart.length === 0 || submitting}
            className="btn-secondary px-3"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onCheckout}
            disabled={cart.length === 0 || submitting || Boolean(calc.error)}
            className="btn-primary flex-1"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Bayar {formatRupiah(total)}
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  tone,
  bold = false,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "rose" | "amber" | "sky";
  bold?: boolean;
}) {
  const tones: Record<string, string> = {
    emerald: "text-emerald-600",
    rose: "text-rose-600",
    amber: "text-amber-600",
    sky: "text-sky-600",
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span
        className={`${bold ? "font-semibold" : ""} ${
          tone ? tones[tone] : "text-slate-800"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function payClass(active: boolean) {
  return `flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
    active
      ? "border-emerald-600 bg-emerald-50 text-emerald-700"
      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
  }`;
}

function overpayClass(active: boolean) {
  return `flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
    active
      ? "border-emerald-600 bg-emerald-50 text-emerald-700"
      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
  }`;
}
