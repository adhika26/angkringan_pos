-- =============================================================
-- Reset data dummy Angkringan POS
-- =============================================================
-- HATI-HATI: data yang dihapus tidak bisa dikembalikan.
-- Backup database Supabase terlebih dahulu.
--
-- Yang DIHAPUS:
--   - transaksi & item transaksi
--   - pelanggan, saldo hutang, saldo deposit, riwayat mutasi
--   - data hutang/piutang lama (debts & debt_payments)
--
-- Yang TETAP:
--   - produk
--   - kategori
--   - akun pengguna (profiles & auth.users)
--
-- Jalankan di Supabase > SQL Editor.
-- =============================================================

do $$
begin
  if to_regclass('public.customer_ledger') is not null then
    execute $sql$
      truncate table
        public.transaction_items,
        public.transactions,
        public.customer_ledger,
        public.customer_accounts,
        public.customers,
        public.debt_payments,
        public.debts
      restart identity cascade
    $sql$;
  else
    -- Untuk database yang belum menjalankan migrasi hutang/deposit.
    execute $sql$
      truncate table
        public.transaction_items,
        public.transactions,
        public.debt_payments,
        public.debts
      restart identity cascade
    $sql$;
  end if;
end $$;

-- Cek hasil. Produk & kategori harus tetap berisi.
select 'products' as tabel, count(*) as jumlah from public.products
union all
select 'categories', count(*) as jumlah from public.categories
union all
select 'transactions' as tabel, count(*) as jumlah from public.transactions
union all
select 'debts' as tabel, count(*) as jumlah from public.debts;

-- Jika tabel pelanggan sudah ada, cek juga:
-- select 'customers' as tabel, count(*) as jumlah from public.customers;
