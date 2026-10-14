-- =============================================================================
-- Point of sale: GCash references and voided sales
-- =============================================================================
-- 1. GCash sales record the customer's 13-digit GCash reference number. A
--    reference can be on only one sale that hasn't been voided, so the same
--    payment can't be counted twice.
-- 2. The owner can void a sale rung up by mistake: every piece goes back into
--    stock (logged as a return that points to the sale), and the sale is marked
--    void with who, when, and why. Sales are never deleted.
-- 3. Each sale carries a one-time key from the register. If the reply to a sale
--    is lost and Charge is tapped again, the same sale comes back instead of a
--    second one being recorded.
-- Safe to run more than once.
-- =============================================================================

alter table public.sales
  add column if not exists gcash_reference text,
  add column if not exists voided_at       timestamptz,
  add column if not exists voided_by       uuid references public.profiles (id) on delete restrict,
  add column if not exists void_reason     text,
  add column if not exists request_id      uuid;

comment on column public.sales.request_id is 'One-time key the register sends with a sale, so a retried Charge returns the same sale.';
create unique index if not exists sales_request_id_key on public.sales (request_id) where request_id is not null;

comment on column public.sales.gcash_reference is 'GCash reference number (13 digits) for GCash sales.';
comment on column public.sales.voided_at is 'When the owner voided the sale; stock was returned. Null for a standing sale.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sales_gcash_reference_format') then
    alter table public.sales
      add constraint sales_gcash_reference_format check (gcash_reference is null or gcash_reference ~ '^[0-9]{13}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_void_complete') then
    alter table public.sales
      add constraint sales_void_complete check (
        (voided_at is null and voided_by is null and void_reason is null)
        or (voided_at is not null and voided_by is not null and void_reason is not null)
      );
  end if;
end;
$$;

create unique index if not exists sales_gcash_reference_live_key
  on public.sales (gcash_reference)
  where gcash_reference is not null and voided_at is null;


-- -----------------------------------------------------------------------------
-- rpc('create_pos_sale', { p_items, p_amount_paid, p_payment_method, p_gcash_reference, p_request_id })
--   Same as before, plus: GCash sales need p_gcash_reference (13 digits), and a
--   repeated p_request_id returns the sale already recorded with it.
-- -----------------------------------------------------------------------------

drop function if exists public.create_pos_sale(jsonb, numeric, public.payment_method);
drop function if exists public.create_pos_sale(jsonb, numeric, public.payment_method, text);

create or replace function public.create_pos_sale(
  p_items           jsonb,
  p_amount_paid     numeric,
  p_payment_method  public.payment_method,
  p_gcash_reference text default null,
  p_request_id      uuid default null
)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_sale     public.sales;
  v_subtotal numeric(12, 2) := 0;
  v_item     record;
  v_variant  public.product_variants;
  v_paid     numeric(12, 2);
  v_ref      text := nullif(regexp_replace(coalesce(p_gcash_reference, ''), '\s', '', 'g'), '');
begin
  if v_uid is null or not public.is_staff() then
    raise exception 'Only staff or owners can record sales' using errcode = '42501';
  end if;

  -- A retried Charge: hand back the sale this key already recorded. The lock makes a
  -- second request with the same key wait for the first and then find its sale.
  if p_request_id is not null then
    perform pg_advisory_xact_lock(hashtext('create_pos_sale:' || p_request_id::text));
    select * into v_sale from public.sales where request_id = p_request_id;
    if found then
      return v_sale;
    end if;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A sale needs at least one item' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where (e ->> 'variant_id') is null
       or coalesce((e ->> 'quantity')::integer, 0) <= 0
  ) then
    raise exception 'Every item needs a variant_id and a quantity above 0' using errcode = '22023';
  end if;

  if p_payment_method = 'gcash' then
    if v_ref is null or v_ref !~ '^[0-9]{13}$' then
      raise exception 'A GCash sale needs the 13-digit GCash reference number' using errcode = '22023';
    end if;
  else
    v_ref := null;
  end if;

  -- Lock variants in a fixed order (avoids deadlocks between two registers)
  -- and check stock before writing anything.
  for v_item in
    select (e ->> 'variant_id')::uuid as variant_id, sum((e ->> 'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) e
    group by 1
    order by 1
  loop
    select * into v_variant
    from public.product_variants
    where id = v_item.variant_id
    for update;

    if not found then
      raise exception 'Product variant % not found', v_item.variant_id using errcode = 'P0002';
    end if;

    -- DETAIL carries the variant id, so the register can point at the exact cart line.
    if not v_variant.is_active
       or not exists (select 1 from public.products where id = v_variant.product_id and is_active) then
      raise exception 'Variant % (%) is not available for sale', coalesce(v_variant.sku, v_variant.id::text), concat_ws(' / ', v_variant.size, v_variant.color)
        using errcode = 'P0001', detail = 'variant:' || v_variant.id::text || ':unavailable';
    end if;

    if v_variant.stock_quantity < v_item.quantity then
      raise exception 'Insufficient stock for %: % available, % requested',
        coalesce(v_variant.sku, v_variant.id::text), v_variant.stock_quantity, v_item.quantity
        using errcode = 'P0001', detail = 'variant:' || v_variant.id::text || ':short:' || v_variant.stock_quantity::text;
    end if;

    v_subtotal := v_subtotal + v_variant.price * v_item.quantity;
  end loop;

  -- GCash pays the exact total, whatever the register last showed; cash must cover it.
  v_paid := case when p_payment_method = 'gcash' then v_subtotal else p_amount_paid end;
  if v_paid is null or v_paid < v_subtotal then
    raise exception 'Amount paid (₱%) is less than the total (₱%)', coalesce(v_paid, 0), v_subtotal
      using errcode = 'P0001';
  end if;

  insert into public.sales (cashier_id, subtotal, amount_paid, change_amount, payment_method, gcash_reference, request_id)
  values (v_uid, v_subtotal, v_paid, v_paid - v_subtotal, p_payment_method, v_ref, p_request_id)
  returning * into v_sale;

  for v_item in
    select (e ->> 'variant_id')::uuid as variant_id, sum((e ->> 'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) e
    group by 1
    order by 1
  loop
    insert into public.sale_items (sale_id, variant_id, quantity, unit_price)
    select v_sale.id, v.id, v_item.quantity, v.price
    from public.product_variants v
    where v.id = v_item.variant_id;

    perform private.apply_stock_change(
      v_item.variant_id, -v_item.quantity, 'sale',
      'POS sale ' || v_sale.receipt_number, v_sale.id, v_uid
    );
  end loop;

  return v_sale;
end;
$$;


-- -----------------------------------------------------------------------------
-- rpc('void_pos_sale', { p_sale_id, p_reason })   owner only
--   Returns every piece to stock (logged as a return pointing to the sale) and
--   marks the sale void. A sale can be voided once.
-- -----------------------------------------------------------------------------

create or replace function public.void_pos_sale(
  p_sale_id uuid,
  p_reason  text
)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_sale   public.sales;
  v_item   record;
  v_reason text := left(btrim(coalesce(p_reason, '')), 300);
begin
  if v_uid is null or not public.is_owner() then
    raise exception 'Only owners can void sales' using errcode = '42501';
  end if;

  if length(v_reason) < 3 then
    raise exception 'Give a reason for voiding the sale' using errcode = '22023';
  end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'Sale not found' using errcode = 'P0002';
  end if;
  if v_sale.voided_at is not null then
    raise exception 'This sale was already voided' using errcode = 'P0001';
  end if;

  for v_item in
    select variant_id, sum(quantity)::integer as quantity
    from public.sale_items
    where sale_id = p_sale_id
    group by variant_id
    order by variant_id
  loop
    perform private.apply_stock_change(
      v_item.variant_id, v_item.quantity, 'return',
      'Voided sale ' || v_sale.receipt_number || ': ' || v_reason, v_sale.id, v_uid
    );
  end loop;

  update public.sales
  set voided_at = now(), voided_by = v_uid, void_reason = v_reason
  where id = p_sale_id
  returning * into v_sale;

  return v_sale;
end;
$$;

revoke execute on function public.create_pos_sale(jsonb, numeric, public.payment_method, text, uuid) from public, anon;
revoke execute on function public.void_pos_sale(uuid, text) from public, anon;
grant execute on function public.create_pos_sale(jsonb, numeric, public.payment_method, text, uuid) to authenticated;
grant execute on function public.void_pos_sale(uuid, text) to authenticated;
