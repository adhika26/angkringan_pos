-- =============================================================
-- Angkringan POS - Skema Database Supabase
-- Jalankan seluruh file ini di Supabase > SQL Editor (sekali).
-- =============================================================

-- ---------- Tabel ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'cashier' check (role in ('owner', 'cashier')),
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id bigint generated always as identity primary key,
  name text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id bigint generated always as identity primary key,
  name text not null,
  category_id bigint references public.categories (id) on delete set null,
  price numeric(12, 2) not null default 0 check (price >= 0),
  stock int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id bigint generated always as identity primary key,
  type text not null check (type in ('sale', 'income', 'expense')),
  total numeric(12, 2) not null default 0,
  payment_method text check (payment_method in ('cash', 'qris', 'transfer', 'ewallet')),
  category text,
  note text,
  cashier_id uuid references auth.users (id) on delete set null,
  cashier_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.transaction_items (
  id bigint generated always as identity primary key,
  transaction_id bigint not null references public.transactions (id) on delete cascade,
  product_id bigint references public.products (id) on delete set null,
  product_name text not null,
  price numeric(12, 2) not null,
  qty int not null check (qty > 0),
  subtotal numeric(12, 2) not null
);

create table if not exists public.debts (
  id bigint generated always as identity primary key,
  direction text not null check (direction in ('payable', 'receivable')),
  party_name text not null,
  description text,
  amount numeric(12, 2) not null check (amount > 0),
  paid_amount numeric(12, 2) not null default 0 check (paid_amount >= 0),
  due_date date,
  status text not null default 'open' check (status in ('open', 'paid')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.debt_payments (
  id bigint generated always as identity primary key,
  debt_id bigint not null references public.debts (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  note text,
  paid_at timestamptz not null default now()
);

-- ---------- Index ----------

create index if not exists idx_transactions_created_at on public.transactions (created_at desc);
create index if not exists idx_transactions_type on public.transactions (type);
create index if not exists idx_transaction_items_transaction on public.transaction_items (transaction_id);
create index if not exists idx_debts_status on public.debts (status, direction);
create index if not exists idx_debt_payments_debt on public.debt_payments (debt_id);

-- ---------- Helper ----------

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner'
  );
$$;

-- User pertama yang mendaftar otomatis menjadi owner, sisanya kasir.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if not exists (select 1 from public.profiles) then
    v_role := 'owner';
  else
    v_role := 'cashier';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    v_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------- Fungsi transaksi ----------

-- Membuat penjualan (POS) secara atomik + potong stok.
create or replace function public.create_sale(
  p_items jsonb,
  p_payment_method text,
  p_note text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx_id bigint;
  v_total numeric(12, 2) := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty int;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang masih kosong';
  end if;

  insert into public.transactions (type, total, payment_method, note, cashier_id, cashier_name)
  values (
    'sale', 0, p_payment_method, p_note, auth.uid(),
    (select coalesce(full_name, email) from public.profiles where id = auth.uid())
  )
  returning id into v_tx_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product
    from public.products
    where id = (v_item ->> 'product_id')::bigint and is_active = true;

    if not found then
      raise exception 'Produk tidak ditemukan atau sudah nonaktif';
    end if;

    v_qty := (v_item ->> 'qty')::int;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Jumlah item tidak valid';
    end if;

    insert into public.transaction_items (transaction_id, product_id, product_name, price, qty, subtotal)
    values (v_tx_id, v_product.id, v_product.name, v_product.price, v_qty, v_product.price * v_qty);

    update public.products set stock = stock - v_qty where id = v_product.id;

    v_total := v_total + (v_product.price * v_qty);
  end loop;

  update public.transactions set total = v_total where id = v_tx_id;
  return v_tx_id;
end;
$$;

-- Mencatat cicilan pembayaran hutang/piutang.
create or replace function public.pay_debt(
  p_debt_id bigint,
  p_amount numeric,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining numeric(12, 2);
begin
  if not public.is_owner() then
    raise exception 'Hanya owner yang dapat mencatat cicilan';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Nominal pembayaran tidak valid';
  end if;

  select amount - paid_amount into v_remaining
  from public.debts where id = p_debt_id for update;

  if not found then
    raise exception 'Data hutang tidak ditemukan';
  end if;

  if p_amount > v_remaining then
    raise exception 'Nominal melebihi sisa hutang';
  end if;

  insert into public.debt_payments (debt_id, amount, note)
  values (p_debt_id, p_amount, p_note);

  update public.debts
  set paid_amount = paid_amount + p_amount,
      status = case when paid_amount + p_amount >= amount then 'paid' else 'open' end
  where id = p_debt_id;
end;
$$;

-- ---------- Row Level Security ----------

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;
alter table public.debts enable row level security;
alter table public.debt_payments enable row level security;

-- profiles
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- categories
drop policy if exists "categories_select" on public.categories;
create policy "categories_select" on public.categories
  for select to authenticated using (true);

drop policy if exists "categories_write" on public.categories;
create policy "categories_write" on public.categories
  for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- products
drop policy if exists "products_select" on public.products;
create policy "products_select" on public.products
  for select to authenticated using (true);

drop policy if exists "products_write" on public.products;
create policy "products_write" on public.products
  for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- transactions
drop policy if exists "transactions_select" on public.transactions;
create policy "transactions_select" on public.transactions
  for select to authenticated using (true);

drop policy if exists "transactions_insert" on public.transactions;
create policy "transactions_insert" on public.transactions
  for insert to authenticated
  with check (cashier_id = auth.uid());

drop policy if exists "transactions_delete" on public.transactions;
create policy "transactions_delete" on public.transactions
  for delete to authenticated using (public.is_owner());

-- transaction_items
drop policy if exists "items_select" on public.transaction_items;
create policy "items_select" on public.transaction_items
  for select to authenticated using (true);

drop policy if exists "items_insert" on public.transaction_items;
create policy "items_insert" on public.transaction_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.transactions t
      where t.id = transaction_id and t.cashier_id = auth.uid()
    )
  );

-- debts
drop policy if exists "debts_select" on public.debts;
create policy "debts_select" on public.debts
  for select to authenticated using (true);

drop policy if exists "debts_write" on public.debts;
create policy "debts_write" on public.debts
  for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- debt_payments
drop policy if exists "debt_payments_select" on public.debt_payments;
create policy "debt_payments_select" on public.debt_payments
  for select to authenticated using (true);

drop policy if exists "debt_payments_write" on public.debt_payments;
create policy "debt_payments_write" on public.debt_payments
  for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ---------- Hak akses ----------

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.create_sale(jsonb, text, text) to authenticated;
grant execute on function public.pay_debt(bigint, numeric, text) to authenticated;
