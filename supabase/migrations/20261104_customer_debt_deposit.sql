-- =============================================================
-- Migrasi: Hutang Pelanggan & Deposit
-- Jalankan di Supabase > SQL Editor SETELAH backup database.
-- Aman dijalankan berulang (idempotent).
-- =============================================================

-- ---------- 1. Tabel pelanggan ----------

create table if not exists public.customers (
  id bigint generated always as identity primary key,
  name text not null,
  name_key text not null unique,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_accounts (
  customer_id bigint primary key references public.customers (id) on delete cascade,
  debt_balance numeric(12, 2) not null default 0 check (debt_balance >= 0),
  deposit_balance numeric(12, 2) not null default 0 check (deposit_balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_ledger (
  id bigint generated always as identity primary key,
  customer_id bigint not null references public.customers (id) on delete cascade,
  kind text not null check (
    kind in (
      'debt_add',
      'debt_payment',
      'deposit_add',
      'deposit_use',
      'deposit_refund',
      'debt_adjustment_add',
      'debt_adjustment_sub',
      'deposit_adjustment_add',
      'deposit_adjustment_sub',
      'adjustment'
    )
  ),
  amount numeric(12, 2) not null check (amount > 0),
  transaction_id bigint references public.transactions (id) on delete set null,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  legacy_key text unique,
  created_at timestamptz not null default now()
);

-- ---------- 2. Kolom baru di transaksi ----------

alter table public.transactions
  add column if not exists customer_id bigint references public.customers (id) on delete set null;

alter table public.transactions
  add column if not exists cash_received numeric(12, 2);

alter table public.transactions
  add column if not exists change_amount numeric(12, 2) not null default 0;

alter table public.transactions
  add column if not exists deposit_used numeric(12, 2) not null default 0;

alter table public.transactions
  add column if not exists debt_added numeric(12, 2) not null default 0;

alter table public.transactions
  add column if not exists debt_paid numeric(12, 2) not null default 0;

alter table public.transactions
  add column if not exists deposit_added numeric(12, 2) not null default 0;

-- ---------- 3. Index ----------

create index if not exists idx_customers_name_key on public.customers (name_key);
create index if not exists idx_customer_accounts_debt on public.customer_accounts (debt_balance);
create index if not exists idx_customer_accounts_deposit on public.customer_accounts (deposit_balance);
create index if not exists idx_customer_ledger_customer on public.customer_ledger (customer_id, created_at desc);
create index if not exists idx_transactions_customer on public.transactions (customer_id);

-- ---------- 4. Trigger pelanggan baru ----------

create or replace function public.handle_new_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.customer_accounts (customer_id)
  values (new.id)
  on conflict (customer_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_customer_created on public.customers;
create trigger on_customer_created
after insert on public.customers
for each row execute function public.handle_new_customer();

-- ---------- 5. Cegah hapus transaksi yang memengaruhi saldo ----------

create or replace function public.prevent_accounted_sale_delete()
returns trigger
language plpgsql
as $$
begin
  if old.type = 'sale' and (
    coalesce(old.debt_added, 0) > 0
    or coalesce(old.debt_paid, 0) > 0
    or coalesce(old.deposit_used, 0) > 0
    or coalesce(old.deposit_added, 0) > 0
  ) then
    raise exception 'Transaksi ini terkait hutang/deposit dan tidak bisa dihapus. Koreksi lewat halaman Hutang Pelanggan.';
  end if;

  return old;
end;
$$;

drop trigger if exists prevent_accounted_sale_delete on public.transactions;
create trigger prevent_accounted_sale_delete
before delete on public.transactions
for each row execute function public.prevent_accounted_sale_delete();

-- ---------- 6. Fungsi pelanggan ----------

create or replace function public.ensure_customer(p_name text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_key text;
  v_id bigint;
begin
  if v_name = '' then
    raise exception 'Nama pelanggan wajib diisi';
  end if;

  v_key := lower(v_name);

  insert into public.customers (name, name_key)
  values (v_name, v_key)
  on conflict (name_key) do nothing;

  select id into v_id
  from public.customers
  where name_key = v_key;

  if v_id is null then
    raise exception 'Gagal membuat pelanggan';
  end if;

  return v_id;
end;
$$;

-- ---------- 7. Checkout penjualan ----------

drop function if exists public.create_sale(jsonb, text, text);

create or replace function public.checkout_sale(
  p_items jsonb,
  p_payment_method text,
  p_note text default null,
  p_customer_name text default null,
  p_cash_received numeric default null,
  p_overpayment_action text default 'change',
  p_use_deposit boolean default true
)
returns jsonb
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
  v_customer_id bigint;
  v_debt numeric(12, 2) := 0;
  v_deposit numeric(12, 2) := 0;
  v_deposit_used numeric(12, 2) := 0;
  v_remaining numeric(12, 2) := 0;
  v_cash numeric(12, 2);
  v_shortfall numeric(12, 2) := 0;
  v_surplus numeric(12, 2) := 0;
  v_debt_paid numeric(12, 2) := 0;
  v_change numeric(12, 2) := 0;
  v_deposit_added numeric(12, 2) := 0;
  v_new_debt numeric(12, 2) := 0;
  v_new_deposit numeric(12, 2) := 0;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang masih kosong';
  end if;

  if p_payment_method not in ('cash', 'qris', 'transfer', 'ewallet') then
    raise exception 'Metode pembayaran tidak valid';
  end if;

  if p_overpayment_action not in ('change', 'deposit') then
    raise exception 'Pilihan kelebihan bayar tidak valid';
  end if;

  if p_customer_name is not null and btrim(p_customer_name) <> '' then
    v_customer_id := public.ensure_customer(p_customer_name);

    insert into public.customer_accounts (customer_id)
    values (v_customer_id)
    on conflict (customer_id) do nothing;

    select debt_balance, deposit_balance
    into v_debt, v_deposit
    from public.customer_accounts
    where customer_id = v_customer_id
    for update;

    if not found then
      raise exception 'Akun pelanggan tidak ditemukan';
    end if;
  end if;

  insert into public.transactions (
    type,
    total,
    payment_method,
    note,
    cashier_id,
    cashier_name,
    customer_id
  )
  values (
    'sale',
    0,
    p_payment_method,
    p_note,
    auth.uid(),
    (select coalesce(full_name, email) from public.profiles where id = auth.uid()),
    v_customer_id
  )
  returning id into v_tx_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select *
    into v_product
    from public.products
    where id = (v_item ->> 'product_id')::bigint and is_active = true
    for update;

    if not found then
      raise exception 'Produk tidak ditemukan atau sudah nonaktif';
    end if;

    v_qty := (v_item ->> 'qty')::int;

    if v_qty is null or v_qty <= 0 then
      raise exception 'Jumlah item tidak valid';
    end if;

    if v_product.stock < v_qty then
      raise exception 'Stok % tidak cukup', v_product.name;
    end if;

    insert into public.transaction_items (
      transaction_id,
      product_id,
      product_name,
      price,
      qty,
      subtotal
    )
    values (
      v_tx_id,
      v_product.id,
      v_product.name,
      v_product.price,
      v_qty,
      v_product.price * v_qty
    );

    update public.products
    set stock = stock - v_qty
    where id = v_product.id;

    v_total := v_total + (v_product.price * v_qty);
  end loop;

  if v_customer_id is not null and p_use_deposit then
    v_deposit_used := least(v_deposit, v_total);
  end if;

  v_remaining := v_total - v_deposit_used;
  v_cash := coalesce(p_cash_received, v_remaining);

  if v_cash < 0 then
    raise exception 'Uang diterima tidak valid';
  end if;

  if v_cash < v_remaining then
    if v_customer_id is null then
      raise exception 'Isi nama pelanggan untuk mencatat kekurangan sebagai hutang';
    end if;

    v_shortfall := v_remaining - v_cash;
    v_new_debt := v_debt + v_shortfall;
  else
    v_surplus := v_cash - v_remaining;
    v_debt_paid := least(v_surplus, v_debt);
    v_new_debt := v_debt - v_debt_paid;
    v_surplus := v_surplus - v_debt_paid;

    if v_surplus > 0 then
      if p_overpayment_action = 'deposit' then
        if v_customer_id is null then
          raise exception 'Isi nama pelanggan untuk menyimpan kelebihan sebagai deposit';
        end if;

        v_deposit_added := v_surplus;
      else
        v_change := v_surplus;
      end if;
    end if;
  end if;

  v_new_deposit := v_deposit - v_deposit_used + v_deposit_added;

  if v_customer_id is not null then
    update public.customer_accounts
    set debt_balance = v_new_debt,
        deposit_balance = v_new_deposit,
        updated_at = now()
    where customer_id = v_customer_id;

    if v_shortfall > 0 then
      insert into public.customer_ledger (
        customer_id, kind, amount, transaction_id, note, created_by
      )
      values (
        v_customer_id, 'debt_add', v_shortfall, v_tx_id,
        'Kekurangan bayar transaksi', auth.uid()
      );
    end if;

    if v_debt_paid > 0 then
      insert into public.customer_ledger (
        customer_id, kind, amount, transaction_id, note, created_by
      )
      values (
        v_customer_id, 'debt_payment', v_debt_paid, v_tx_id,
        'Kelebihan bayar melunasi hutang', auth.uid()
      );
    end if;

    if v_deposit_used > 0 then
      insert into public.customer_ledger (
        customer_id, kind, amount, transaction_id, note, created_by
      )
      values (
        v_customer_id, 'deposit_use', v_deposit_used, v_tx_id,
        'Deposit dipakai untuk belanja', auth.uid()
      );
    end if;

    if v_deposit_added > 0 then
      insert into public.customer_ledger (
        customer_id, kind, amount, transaction_id, note, created_by
      )
      values (
        v_customer_id, 'deposit_add', v_deposit_added, v_tx_id,
        'Kelebihan bayar disimpan sebagai deposit', auth.uid()
      );
    end if;
  else
    v_new_debt := 0;
    v_new_deposit := 0;
  end if;

  update public.transactions
  set total = v_total,
      cash_received = v_cash,
      change_amount = v_change,
      deposit_used = v_deposit_used,
      debt_added = v_shortfall,
      debt_paid = v_debt_paid,
      deposit_added = v_deposit_added
  where id = v_tx_id;

  return jsonb_build_object(
    'transaction_id', v_tx_id,
    'total', v_total,
    'deposit_used', v_deposit_used,
    'cash_received', v_cash,
    'change_amount', v_change,
    'debt_added', v_shortfall,
    'debt_paid', v_debt_paid,
    'deposit_added', v_deposit_added,
    'new_debt_balance', v_new_debt,
    'new_deposit_balance', v_new_deposit
  );
end;
$$;

-- ---------- 8. Pembayaran hutang & deposit ----------

create or replace function public.pay_customer_debt(
  p_customer_id bigint,
  p_amount numeric,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debt numeric(12, 2);
  v_new numeric(12, 2);
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Nominal pembayaran tidak valid';
  end if;

  insert into public.customer_accounts (customer_id)
  values (p_customer_id)
  on conflict (customer_id) do nothing;

  select debt_balance
  into v_debt
  from public.customer_accounts
  where customer_id = p_customer_id
  for update;

  if not found then
    raise exception 'Pelanggan tidak ditemukan';
  end if;

  if p_amount > v_debt then
    raise exception 'Nominal melebihi sisa hutang';
  end if;

  v_new := v_debt - p_amount;

  update public.customer_accounts
  set debt_balance = v_new,
      updated_at = now()
  where customer_id = p_customer_id;

  insert into public.customer_ledger (
    customer_id, kind, amount, note, created_by
  )
  values (
    p_customer_id, 'debt_payment', p_amount, p_note, auth.uid()
  );

  return jsonb_build_object('new_debt_balance', v_new);
end;
$$;

create or replace function public.add_customer_deposit(
  p_customer_id bigint,
  p_amount numeric,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debt numeric(12, 2);
  v_deposit numeric(12, 2);
  v_new numeric(12, 2);
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Nominal deposit tidak valid';
  end if;

  insert into public.customer_accounts (customer_id)
  values (p_customer_id)
  on conflict (customer_id) do nothing;

  select debt_balance, deposit_balance
  into v_debt, v_deposit
  from public.customer_accounts
  where customer_id = p_customer_id
  for update;

  if not found then
    raise exception 'Pelanggan tidak ditemukan';
  end if;

  if v_debt > 0 then
    raise exception 'Lunasi hutang pelanggan terlebih dahulu sebelum menambah deposit';
  end if;

  v_new := v_deposit + p_amount;

  update public.customer_accounts
  set deposit_balance = v_new,
      updated_at = now()
  where customer_id = p_customer_id;

  insert into public.customer_ledger (
    customer_id, kind, amount, note, created_by
  )
  values (
    p_customer_id, 'deposit_add', p_amount, p_note, auth.uid()
  );

  return jsonb_build_object('new_deposit_balance', v_new);
end;
$$;

create or replace function public.refund_customer_deposit(
  p_customer_id bigint,
  p_amount numeric,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deposit numeric(12, 2);
  v_new numeric(12, 2);
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Nominal penarikan tidak valid';
  end if;

  insert into public.customer_accounts (customer_id)
  values (p_customer_id)
  on conflict (customer_id) do nothing;

  select deposit_balance
  into v_deposit
  from public.customer_accounts
  where customer_id = p_customer_id
  for update;

  if not found then
    raise exception 'Pelanggan tidak ditemukan';
  end if;

  if p_amount > v_deposit then
    raise exception 'Nominal melebihi saldo deposit';
  end if;

  v_new := v_deposit - p_amount;

  update public.customer_accounts
  set deposit_balance = v_new,
      updated_at = now()
  where customer_id = p_customer_id;

  insert into public.customer_ledger (
    customer_id, kind, amount, note, created_by
  )
  values (
    p_customer_id, 'deposit_refund', p_amount, p_note, auth.uid()
  );

  return jsonb_build_object('new_deposit_balance', v_new);
end;
$$;

-- ---------- 8b. Tambah hutang manual ----------

create or replace function public.add_customer_debt(
  p_customer_id bigint,
  p_amount numeric,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debt numeric(12, 2);
  v_deposit numeric(12, 2);
  v_new numeric(12, 2);
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Nominal hutang tidak valid';
  end if;

  insert into public.customer_accounts (customer_id)
  values (p_customer_id)
  on conflict (customer_id) do nothing;

  select debt_balance, deposit_balance
  into v_debt, v_deposit
  from public.customer_accounts
  where customer_id = p_customer_id
  for update;

  if not found then
    raise exception 'Pelanggan tidak ditemukan';
  end if;

  if v_deposit > 0 then
    raise exception 'Tarik deposit pelanggan terlebih dahulu sebelum menambah hutang';
  end if;

  v_new := v_debt + p_amount;

  update public.customer_accounts
  set debt_balance = v_new,
      updated_at = now()
  where customer_id = p_customer_id;

  insert into public.customer_ledger (
    customer_id, kind, amount, note, created_by
  )
  values (
    p_customer_id, 'debt_add', p_amount, p_note, auth.uid()
  );

  return jsonb_build_object('new_debt_balance', v_new);
end;
$$;

-- ---------- 8c. Koreksi saldo ----------

create or replace function public.adjust_customer_account(
  p_customer_id bigint,
  p_account text,
  p_direction text,
  p_amount numeric,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debt numeric(12, 2);
  v_deposit numeric(12, 2);
  v_new_debt numeric(12, 2);
  v_new_deposit numeric(12, 2);
  v_kind text;
begin
  if p_account not in ('debt', 'deposit') then
    raise exception 'Jenis saldo tidak valid';
  end if;

  if p_direction not in ('add', 'sub') then
    raise exception 'Arah koreksi tidak valid';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Nominal koreksi tidak valid';
  end if;

  insert into public.customer_accounts (customer_id)
  values (p_customer_id)
  on conflict (customer_id) do nothing;

  select debt_balance, deposit_balance
  into v_debt, v_deposit
  from public.customer_accounts
  where customer_id = p_customer_id
  for update;

  if not found then
    raise exception 'Pelanggan tidak ditemukan';
  end if;

  v_new_debt := v_debt;
  v_new_deposit := v_deposit;

  if p_account = 'debt' then
    if p_direction = 'add' then
      if v_deposit > 0 then
        raise exception 'Tarik deposit pelanggan terlebih dahulu sebelum menambah hutang';
      end if;
      v_new_debt := v_debt + p_amount;
      v_kind := 'debt_adjustment_add';
    else
      if p_amount > v_debt then
        raise exception 'Nominal koreksi melebihi saldo hutang';
      end if;
      v_new_debt := v_debt - p_amount;
      v_kind := 'debt_adjustment_sub';
    end if;
  else
    if p_direction = 'add' then
      if v_debt > 0 then
        raise exception 'Lunasi hutang pelanggan terlebih dahulu sebelum menambah deposit';
      end if;
      v_new_deposit := v_deposit + p_amount;
      v_kind := 'deposit_adjustment_add';
    else
      if p_amount > v_deposit then
        raise exception 'Nominal koreksi melebihi saldo deposit';
      end if;
      v_new_deposit := v_deposit - p_amount;
      v_kind := 'deposit_adjustment_sub';
    end if;
  end if;

  update public.customer_accounts
  set debt_balance = v_new_debt,
      deposit_balance = v_new_deposit,
      updated_at = now()
  where customer_id = p_customer_id;

  insert into public.customer_ledger (
    customer_id, kind, amount, note, created_by
  )
  values (
    p_customer_id, v_kind, p_amount, p_note, auth.uid()
  );

  return jsonb_build_object(
    'new_debt_balance', v_new_debt,
    'new_deposit_balance', v_new_deposit
  );
end;
$$;

-- ---------- 8d. Edit / gabung nama pelanggan ----------

create or replace function public.rename_customer(
  p_customer_id bigint,
  p_new_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_name text := btrim(coalesce(p_new_name, ''));
  v_new_key text;
  v_current_key text;
  v_target_id bigint;
  v_source_debt numeric(12, 2);
  v_source_deposit numeric(12, 2);
  v_target_debt numeric(12, 2);
  v_target_deposit numeric(12, 2);
  v_merged boolean := false;
begin
  if v_new_name = '' then
    raise exception 'Nama pelanggan wajib diisi';
  end if;

  v_new_key := lower(v_new_name);

  select name_key into v_current_key
  from public.customers
  where id = p_customer_id;

  if not found then
    raise exception 'Pelanggan tidak ditemukan';
  end if;

  if v_current_key = v_new_key then
    update public.customers set name = v_new_name where id = p_customer_id;
    return jsonb_build_object('customer_id', p_customer_id, 'merged', false);
  end if;

  select id into v_target_id
  from public.customers
  where name_key = v_new_key and id <> p_customer_id;

  if v_target_id is null then
    update public.customers
    set name = v_new_name, name_key = v_new_key
    where id = p_customer_id;

    return jsonb_build_object('customer_id', p_customer_id, 'merged', false);
  end if;

  v_merged := true;

  insert into public.customer_accounts (customer_id)
  values (p_customer_id), (v_target_id)
  on conflict (customer_id) do nothing;

  perform 1
  from public.customer_accounts
  where customer_id in (p_customer_id, v_target_id)
  order by customer_id
  for update;

  select debt_balance, deposit_balance
  into v_source_debt, v_source_deposit
  from public.customer_accounts
  where customer_id = p_customer_id;

  select debt_balance, deposit_balance
  into v_target_debt, v_target_deposit
  from public.customer_accounts
  where customer_id = v_target_id;

  update public.customer_ledger
  set customer_id = v_target_id
  where customer_id = p_customer_id;

  update public.transactions
  set customer_id = v_target_id
  where customer_id = p_customer_id;

  update public.customer_accounts
  set debt_balance = coalesce(v_target_debt, 0) + coalesce(v_source_debt, 0),
      deposit_balance = coalesce(v_target_deposit, 0) + coalesce(v_source_deposit, 0),
      updated_at = now()
  where customer_id = v_target_id;

  delete from public.customers where id = p_customer_id;

  update public.customers set name = v_new_name where id = v_target_id;

  return jsonb_build_object('customer_id', v_target_id, 'merged', v_merged);
end;
$$;

-- ---------- 9. Backfill transaksi lama ----------

update public.transactions
set cash_received = total
where type = 'sale' and cash_received is null;

-- ---------- 10. Migrasi hutang pelanggan lama ----------

insert into public.customers (name, name_key)
select distinct on (lower(btrim(d.party_name)))
  btrim(d.party_name),
  lower(btrim(d.party_name))
from public.debts d
where d.direction = 'receivable'
  and btrim(d.party_name) <> ''
order by lower(btrim(d.party_name)), d.created_at
on conflict (name_key) do nothing;

insert into public.customer_accounts (customer_id)
select c.id from public.customers c
on conflict (customer_id) do nothing;

insert into public.customer_ledger (
  customer_id, kind, amount, note, created_at, legacy_key
)
select
  c.id,
  'debt_add',
  d.amount,
  d.description,
  d.created_at,
  'debt_add:' || d.id
from public.debts d
join public.customers c on c.name_key = lower(btrim(d.party_name))
where d.direction = 'receivable'
on conflict (legacy_key) do nothing;

insert into public.customer_ledger (
  customer_id, kind, amount, note, created_at, legacy_key
)
select
  c.id,
  'debt_payment',
  p.amount,
  p.note,
  p.paid_at,
  'debt_pay:' || p.id
from public.debt_payments p
join public.debts d on d.id = p.debt_id
join public.customers c on c.name_key = lower(btrim(d.party_name))
where d.direction = 'receivable'
on conflict (legacy_key) do nothing;

insert into public.customer_ledger (
  customer_id, kind, amount, note, created_at, legacy_key
)
select
  c.id,
  'debt_payment',
  d.paid_amount - coalesce(
    (select sum(p.amount) from public.debt_payments p where p.debt_id = d.id),
    0
  ),
  'Penyesuaian migrasi',
  d.created_at,
  'debt_pay_adj:' || d.id
from public.debts d
join public.customers c on c.name_key = lower(btrim(d.party_name))
where d.direction = 'receivable'
  and d.paid_amount > coalesce(
    (select sum(p.amount) from public.debt_payments p where p.debt_id = d.id),
    0
  )
on conflict (legacy_key) do nothing;

update public.customer_accounts ca
set debt_balance = greatest(coalesce(agg.debt, 0), 0),
    deposit_balance = greatest(coalesce(agg.deposit, 0), 0),
    updated_at = now()
from (
  select
    customer_id,
    sum(
      case
        when kind in ('debt_add', 'debt_adjustment_add') then amount
        when kind in ('debt_payment', 'debt_adjustment_sub') then -amount
        else 0
      end
    ) as debt,
    sum(
      case
        when kind in ('deposit_add', 'deposit_adjustment_add') then amount
        when kind in ('deposit_use', 'deposit_refund', 'deposit_adjustment_sub') then -amount
        else 0
      end
    ) as deposit
  from public.customer_ledger
  group by customer_id
) agg
where ca.customer_id = agg.customer_id;

-- ---------- 11. RLS ----------

alter table public.customers enable row level security;
alter table public.customer_accounts enable row level security;
alter table public.customer_ledger enable row level security;

drop policy if exists "customers_select" on public.customers;
create policy "customers_select" on public.customers
  for select to authenticated using (true);

drop policy if exists "customers_write" on public.customers;
create policy "customers_write" on public.customers
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists "customer_accounts_select" on public.customer_accounts;
create policy "customer_accounts_select" on public.customer_accounts
  for select to authenticated using (true);

drop policy if exists "customer_accounts_write" on public.customer_accounts;
create policy "customer_accounts_write" on public.customer_accounts
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists "customer_ledger_select" on public.customer_ledger;
create policy "customer_ledger_select" on public.customer_ledger
  for select to authenticated using (true);

drop policy if exists "customer_ledger_write" on public.customer_ledger;
create policy "customer_ledger_write" on public.customer_ledger
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- ---------- 12. Hak akses ----------

grant select, insert, update, delete
  on public.customers, public.customer_accounts, public.customer_ledger
  to authenticated;

grant usage, select on all sequences in schema public to authenticated;

grant execute on function public.ensure_customer(text) to authenticated;
grant execute on function public.checkout_sale(jsonb, text, text, text, numeric, text, boolean) to authenticated;
grant execute on function public.pay_customer_debt(bigint, numeric, text) to authenticated;
grant execute on function public.add_customer_deposit(bigint, numeric, text) to authenticated;
grant execute on function public.refund_customer_deposit(bigint, numeric, text) to authenticated;
grant execute on function public.add_customer_debt(bigint, numeric, text) to authenticated;
grant execute on function public.adjust_customer_account(bigint, text, text, numeric, text) to authenticated;
grant execute on function public.rename_customer(bigint, text) to authenticated;

-- Muat ulang cache skema PostgREST agar relasi baru langsung dikenali.
notify pgrst, 'reload schema';
