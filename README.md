# Angkringan POS

Aplikasi kasir (POS) dan pembukuan sederhana untuk UMKM angkringan/warung.

## Fitur

- **Kasir (POS)**: katalog menu, keranjang, pembayaran **Tunai** & **QRIS**, stok otomatis berkurang.
- **Transaksi manual**: catat pemasukan dan pengeluaran operasional (bahan baku, gas, gaji, dll).
- **Riwayat transaksi**: filter tanggal, jenis, pencarian, dan detail item.
- **Dashboard**: ringkasan pemasukan/pengeluaran/laba hari ini + grafik penjualan 7 hari.
- **Laporan**: rekap harian & bulanan, grafik, dan **export Excel**.
- **Hutang pelanggan & deposit**: kekurangan bayar otomatis jadi hutang, tambah hutang manual, pembayaran hutang, saldo deposit, edit/gabung nama pelanggan, dan koreksi saldo dengan riwayat.
- **Multi-user**: role **Owner** dan **Kasir**.
- **Kelola produk & kategori**.

## Tech Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS v4
- Supabase (PostgreSQL, Auth, Row Level Security)
- Chart.js + react-chartjs-2
- ExcelJS (export)

---

## Cara Setup

### 1. Buat project Supabase

1. Buka [supabase.com](https://supabase.com) lalu buat project baru.
2. Masuk ke **SQL Editor**, buka file `supabase/schema.sql`, salin seluruh isinya, lalu **Run**.
3. Masih di SQL Editor, buka `supabase/seed.sql`, salin, lalu **Run** (mengisi contoh menu angkringan).

> **Sudah punya database lama?** Jangan jalankan ulang `schema.sql`. Backup dulu, lalu jalankan file migrasi di `supabase/migrations/` secara berurutan:
> 1. `20261104_customer_debt_deposit.sql`
> 2. `20261104_customer_corrections.sql`
>
> Keduanya aman dijalankan berulang.
4. Buka **Project Settings > API**, catat:
   - `Project URL`
   - `anon public key`

> Disarankan mematikan konfirmasi email agar login langsung bisa dipakai:
> **Authentication > Sign In / Providers > Email > matikan "Confirm email"**.
> Jika dibiarkan aktif, pengguna harus mengklik tautan di email sebelum bisa masuk.

### 2. Konfigurasi environment

Salin `.env.example` menjadi `.env.local`, lalu isi:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=isi-anon-key-anda
```

### 3. Jalankan aplikasi

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

### 4. Buat akun

- Klik **Daftar** dan buat akun pertama → otomatis menjadi **Owner**.
- Akun berikutnya otomatis menjadi **Kasir**.
- Owner dapat mengubah role pengguna lain di menu **Pengguna**.

---

## Reset Data Dummy

Untuk menghapus data transaksi, pelanggan, hutang/deposit, dan data dummy lainnya **tanpa menghapus produk, kategori, dan akun pengguna**:

1. Backup database Supabase.
2. Buka **SQL Editor**, jalankan file `supabase/reset_data.sql`.

> Skrip ini menghapus permanen. Produk dan kategori tetap dipertahankan.

## Catatan

- **QRIS** pada tahap ini hanya mencatat metode pembayaran (belum terhubung payment gateway).
- Perhitungan laporan memakai waktu lokal perangkat.
- Export Excel dihasilkan di server (`/api/export`) dan hanya untuk owner.
- Jika RLS/role terasa tidak sesuai, pastikan `supabase/schema.sql` dijalankan ulang di project yang benar.

## Struktur Singkat

```
src/
  app/
    (app)/            # halaman setelah login (dashboard, pos, transaksi, dll)
    api/export/       # generate file Excel
    login/            # halaman masuk/daftar
  components/         # app shell, chart
  lib/
    supabase/         # client browser & server
    format.ts         # format rupiah/tanggal
    types.ts
  middleware.ts       # refresh sesi Supabase
supabase/
  schema.sql          # tabel, RLS, fungsi transaksi
  seed.sql            # contoh menu
  migrations/         # migrasi untuk database yang sudah berjalan
```

## Skrip

```bash
npm run dev      # development
npm run build    # production build
npm run start    # jalankan hasil build
npm run lint     # eslint
```
