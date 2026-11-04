-- =============================================================
-- Migrasi: Koreksi Hutang Pelanggan & Deposit
-- Jalankan SETELAH migrasi 20261104_customer_debt_deposit.sql.
-- Aman dijalankan berulang (idempotent).
-- =============================================================

-- ---------- 1. Jenis mutasi baru ----------

alter table public.customer_ledger
  drop constraint if exists customer_ledger_kind_check;

alter table public.customer_ledger
  add constraint customer_ledger_kind_check check (
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
  );

-- ---------- 2. Tambah hutang manual ----------

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

-- ---------- 3. Koreksi saldo (entri penyesuaian) ----------

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

-- ---------- 4. Edit / gabung nama pelanggan ----------

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

-- ---------- 5. Hak akses ----------

grant execute on function public.add_customer_debt(bigint, numeric, text) to authenticated;
grant execute on function public.adjust_customer_account(bigint, text, text, numeric, text) to authenticated;
grant execute on function public.rename_customer(bigint, text) to authenticated;

notify pgrst, 'reload schema';
