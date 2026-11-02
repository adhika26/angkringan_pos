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
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatRupiah } from "@/lib/format";
import type { CartItem, Category, PaymentMethod, Product } from "@/lib/types";

export default function PosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<number | "all">("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [cashReceived, setCashReceived] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const supabase = createClient();
        const [productsRes, categoriesRes] = await Promise.all([
          supabase
            .from("products")
            .select("id, name, category_id, price, stock, is_active")
            .eq("is_active", true)
            .order("name", { ascending: true }),
          supabase
            .from("categories")
            .select("id, name, sort_order")
            .order("sort_order", { ascending: true }),
        ]);

        if (productsRes.error) throw productsRes.error;
        if (categoriesRes.error) throw categoriesRes.error;

        if (active) {
          setProducts((productsRes.data ?? []) as Product[]);
          setCategories((categoriesRes.data ?? []) as Category[]);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Gagal memuat daftar produk.",
          );
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
    () => cart.reduce((sum, item) => sum + Number(item.product.price) * item.qty, 0),
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

  function resetCart() {
    setCart([]);
    setNote("");
    setCashReceived("");
    setPayment("cash");
  }

  async function handleCheckout() {
    if (cart.length === 0 || submitting) return;
    setError(null);

    if (payment === "cash" && cashReceived) {
      if (Number(cashReceived) < total) {
        setError("Uang diterima kurang dari total belanja.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("create_sale", {
        p_items: cart.map((item) => ({
          product_id: item.product.id,
          qty: item.qty,
        })),
        p_payment_method: payment,
        p_note: note.trim() || null,
      });

      if (error) throw error;

      const change =
        payment === "cash" && cashReceived
          ? Number(cashReceived) - total
          : 0;

      setProducts((prev) =>
        prev.map((product) => {
          const sold = cart.find((item) => item.product.id === product.id);
          return sold
            ? { ...product, stock: product.stock - sold.qty }
            : product;
        }),
      );

      setSuccess(
        `Pembayaran berhasil${data ? ` #${data}` : ""}. Total ${formatRupiah(
          total,
        )}${change > 0 ? ` · Kembalian ${formatRupiah(change)}` : ""}`,
      );
      resetCart();
      setCartOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan transaksi.");
    } finally {
      setSubmitting(false);
    }
  }

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
  onChangeQty: (productId: number, delta: number) => void;
  onRemove: (productId: number) => void;
  onCheckout: () => void;
  onClear: () => void;
  submitting: boolean;
}) {
  const change =
    payment === "cash" && cashReceived
      ? Number(cashReceived) - total
      : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 px-5 py-4">
        {cart.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center text-center">
            <ShoppingCart className="h-9 w-9 text-slate-200" />
            <p className="mt-2 text-sm text-slate-500">Keranjang masih kosong</p>
            <p className="text-xs text-slate-400">Pilih menu di sebelah kiri.</p>
          </div>
        ) : (
          cart.map((item) => (
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
          ))
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

        {payment === "cash" && (
          <div>
            <label htmlFor="cashReceived" className="label">
              Uang diterima (opsional)
            </label>
            <input
              id="cashReceived"
              type="number"
              min={0}
              inputMode="numeric"
              value={cashReceived}
              onChange={(e) => setCashReceived(e.target.value)}
              placeholder="Contoh: 50000"
              className="input"
            />
            {change !== null && change >= 0 && (
              <p className="mt-1.5 text-xs font-medium text-emerald-600">
                Kembalian: {formatRupiah(change)}
              </p>
            )}
          </div>
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

        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
          <span className="text-sm font-medium text-slate-600">Total</span>
          <span className="text-lg font-bold text-slate-900">
            {formatRupiah(total)}
          </span>
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
            disabled={cart.length === 0 || submitting}
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

function payClass(active: boolean) {
  return `flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
    active
      ? "border-emerald-600 bg-emerald-50 text-emerald-700"
      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
  }`;
}
