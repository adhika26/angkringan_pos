"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Package,
  Pencil,
  Plus,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatRupiah } from "@/lib/format";
import type { Category, Product } from "@/lib/types";

interface ProductForm {
  id?: number;
  name: string;
  category_id: string;
  price: string;
  stock: string;
  is_active: boolean;
}

const EMPTY_FORM: ProductForm = {
  name: "",
  category_id: "",
  price: "",
  stock: "0",
  is_active: true,
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [role, setRole] = useState<"owner" | "cashier">("cashier");
  const [filterCategory, setFilterCategory] = useState<number | "all">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [newCategory, setNewCategory] = useState("");
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

        const [productsRes, categoriesRes] = await Promise.all([
          supabase
            .from("products")
            .select("id, name, category_id, price, stock, is_active, created_at")
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
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Gagal memuat produk.");
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

  const categoryMap = useMemo(() => {
    const map = new Map<number, string>();
    categories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [categories]);

  const visible = useMemo(
    () =>
      filterCategory === "all"
        ? products
        : products.filter((p) => p.category_id === filterCategory),
    [products, filterCategory],
  );

  function openCreate() {
    setForm({
      ...EMPTY_FORM,
      category_id: categories[0] ? String(categories[0].id) : "",
    });
    setError(null);
    setFormOpen(true);
  }

  function openEdit(product: Product) {
    setForm({
      id: product.id,
      name: product.name,
      category_id: product.category_id ? String(product.category_id) : "",
      price: String(product.price),
      stock: String(product.stock),
      is_active: product.is_active,
    });
    setError(null);
    setFormOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const price = Number(form.price);
    const stock = Number(form.stock);
    if (!form.name.trim()) {
      setError("Nama produk wajib diisi.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError("Harga tidak valid.");
      return;
    }
    if (!Number.isInteger(stock) || stock < 0) {
      setError("Stok harus bilangan bulat >= 0.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const payload = {
        name: form.name.trim(),
        category_id: form.category_id ? Number(form.category_id) : null,
        price,
        stock,
        is_active: form.is_active,
      };

      if (form.id) {
        const { error } = await supabase
          .from("products")
          .update(payload)
          .eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }

      setFormOpen(false);
      setNotice(form.id ? "Produk diperbarui." : "Produk ditambahkan.");
      setRefreshKey((key) => key + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan produk.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(product: Product) {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("products")
        .update({ is_active: !product.is_active })
        .eq("id", product.id);
      if (error) throw error;
      setRefreshKey((key) => key + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengubah status.");
    }
  }

  async function handleDelete(product: Product) {
    if (!window.confirm(`Hapus produk "${product.name}"?`)) return;
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", product.id);
      if (error) throw error;
      setNotice("Produk dihapus.");
      setRefreshKey((key) => key + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus produk.");
    }
  }

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCategory.trim()) return;
    try {
      const supabase = createClient();
      const { error } = await supabase.from("categories").insert({
        name: newCategory.trim(),
        sort_order: categories.length + 1,
      });
      if (error) throw error;
      setNewCategory("");
      setNotice("Kategori ditambahkan.");
      setRefreshKey((key) => key + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menambah kategori.");
    }
  }

  async function deleteCategory(category: Category) {
    if (
      !window.confirm(
        `Hapus kategori "${category.name}"? Produk terkait akan menjadi tanpa kategori.`,
      )
    ) {
      return;
    }
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", category.id);
      if (error) throw error;
      setRefreshKey((key) => key + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus kategori.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Produk
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Kelola menu, harga, dan stok angkringan.
          </p>
        </div>
        {role === "owner" && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCategoryOpen((open) => !open)}
              className="btn-secondary"
            >
              <Tags className="h-4 w-4" />
              Kategori
            </button>
            <button type="button" onClick={openCreate} className="btn-primary">
              <Plus className="h-4 w-4" />
              Tambah Produk
            </button>
          </div>
        )}
      </div>

      {role !== "owner" && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Hanya owner yang dapat mengubah produk.
        </div>
      )}

      {notice && (
        <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="rounded p-0.5 hover:bg-emerald-100"
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

      {categoryOpen && role === "owner" && (
        <div className="card card-pad">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Kategori</h2>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <span
                key={category.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-3 pr-1.5 text-sm text-slate-700"
              >
                {category.name}
                <button
                  type="button"
                  onClick={() => deleteCategory(category)}
                  className="rounded-full p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  aria-label={`Hapus ${category.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
          <form onSubmit={addCategory} className="mt-3 flex gap-2">
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Nama kategori baru"
              className="input max-w-xs"
            />
            <button type="submit" className="btn-secondary">
              <Plus className="h-4 w-4" />
              Tambah
            </button>
          </form>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setFilterCategory("all")}
          className={chipClass(filterCategory === "all")}
        >
          Semua
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => setFilterCategory(category.id)}
            className={chipClass(filterCategory === category.id)}
          >
            {category.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
        </div>
      ) : visible.length === 0 ? (
        <div className="card flex h-56 flex-col items-center justify-center text-center">
          <Package className="h-10 w-10 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-600">
            Belum ada produk
          </p>
          <p className="text-xs text-slate-400">
            Klik &quot;Tambah Produk&quot; untuk memulai.
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>Nama Produk</th>
                <th>Kategori</th>
                <th className="text-right">Harga</th>
                <th className="text-right">Stok</th>
                <th>Status</th>
                {role === "owner" && <th className="text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((product) => (
                <tr key={product.id} className="hover:bg-slate-50/60">
                  <td className="font-medium text-slate-800">{product.name}</td>
                  <td className="text-sm text-slate-500">
                    {product.category_id
                      ? categoryMap.get(product.category_id) ?? "-"
                      : "-"}
                  </td>
                  <td className="whitespace-nowrap text-right font-medium text-slate-700">
                    {formatRupiah(product.price)}
                  </td>
                  <td className="text-right text-sm text-slate-600">
                    {product.stock}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => role === "owner" && toggleActive(product)}
                      className={`badge ${
                        product.is_active
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      } ${role === "owner" ? "cursor-pointer" : ""}`}
                    >
                      {product.is_active ? "Aktif" : "Nonaktif"}
                    </button>
                  </td>
                  {role === "owner" && (
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(product)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(product)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          aria-label="Hapus"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Tutup"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setFormOpen(false)}
          />
          <form
            onSubmit={handleSave}
            className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">
                {form.id ? "Edit Produk" : "Tambah Produk"}
              </h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                aria-label="Tutup"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div>
                <label htmlFor="productName" className="label">
                  Nama produk
                </label>
                <input
                  id="productName"
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Contoh: Nasi Kucing"
                  className="input"
                />
              </div>

              <div>
                <label htmlFor="productCategory" className="label">
                  Kategori
                </label>
                <select
                  id="productCategory"
                  value={form.category_id}
                  onChange={(e) =>
                    setForm({ ...form, category_id: e.target.value })
                  }
                  className="input"
                >
                  <option value="">Tanpa kategori</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="productPrice" className="label">
                    Harga (Rp)
                  </label>
                  <input
                    id="productPrice"
                    type="number"
                    min={0}
                    required
                    value={form.price}
                    onChange={(e) =>
                      setForm({ ...form, price: e.target.value })
                    }
                    className="input"
                  />
                </div>
                <div>
                  <label htmlFor="productStock" className="label">
                    Stok
                  </label>
                  <input
                    id="productStock"
                    type="number"
                    min={0}
                    required
                    value={form.stock}
                    onChange={(e) =>
                      setForm({ ...form, stock: e.target.value })
                    }
                    className="input"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) =>
                    setForm({ ...form, is_active: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                Tampilkan di kasir (aktif)
              </label>

              {error && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="btn-secondary"
              >
                Batal
              </button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Simpan
              </button>
            </div>
          </form>
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
