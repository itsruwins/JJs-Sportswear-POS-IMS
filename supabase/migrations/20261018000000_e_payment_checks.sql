-- =============================================================================
-- E-payments (E4): owner overrides, scans tied to sales, and the owner's checks
-- =============================================================================
-- Needs 20261017000000_receipt_scans.sql.
--
-- 1. payment_overrides: the owner's approval for an e-payment whose amount was
--    changed from what its receipt shows. The owner writes it from their own
--    sign-in (on the cashier's device, without logging the cashier out), for one
--    cashier, one provider, reference, and amount, with a reason. It can be used
--    once, within 10 minutes.
-- 2. sale_payments now says how each e-payment was entered ('scan' or 'typed'),
--    which scan it came from, what the receipt showed (amount and reference), and
--    the override that allowed a different amount. Earlier e-payments were typed.
-- 3. create_pos_sale checks each scanned payment against its scan: the cashier's
--    own scan, read successfully, within a day, and not used before. A changed
--    amount needs a matching, unused, recent override. The sale then claims its
--    scans and overrides. Everything else is unchanged from 20261016120000.
-- 4. rpc('check_sale_payment'): the owner marks a counter e-payment matched to
--    the bank, or disputed with a reason, or puts it back to be checked.
-- Every statement is safe to run again.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Overrides
-- -----------------------------------------------------------------------------

create table if not exists public.payment_overrides (
  id             uuid primary key default gen_random_uuid(),
  approved_by    uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  requested_by   uuid not null references public.profiles (id) on delete restrict,
  provider       text not null references public.payment_providers (code) on delete restrict,
  reference      text not null check (reference ~ '^[A-Z0-9]{1,60}$'),
  receipt_amount numeric(12, 2) check (receipt_amount is null or receipt_amount > 0),
  amount         numeric(12, 2) not null check (amount > 0),
  reason         text not null check (length(btrim(reason)) between 3 and 300),
  used_at        timestamptz,
  sale_id        uuid references public.sales (id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint payment_overrides_sale_when_used check (sale_id is null or used_at is not null)
);

comment on table public.payment_overrides is 'The owner''s approval for a counter e-payment that differs from its receipt. One use, 10 minutes.';

create index if not exists payment_overrides_requested_idx on public.payment_overrides (requested_by, created_at desc);

alter table public.payment_overrides enable row level security;

drop policy if exists "payment_overrides: staff read" on public.payment_overrides;
create policy "payment_overrides: staff read"
  on public.payment_overrides for select to authenticated
  using ((select public.is_staff()));

-- Only an owner, as themselves, for someone on staff.
drop policy if exists "payment_overrides: owner approves" on public.payment_overrides;
create policy "payment_overrides: owner approves"
  on public.payment_overrides for insert to authenticated
  with check (
    (select public.is_owner())
    and approved_by = (select auth.uid())
    and used_at is null
    and sale_id is null
    and exists (select 1 from public.profiles p where p.id = requested_by and p.role in ('staff', 'owner'))
  );

revoke insert, update, delete on public.payment_overrides from anon, authenticated;
grant insert (requested_by, provider, reference, receipt_amount, amount, reason) on public.payment_overrides to authenticated;


-- -----------------------------------------------------------------------------
-- 2. How each e-payment was entered
-- -----------------------------------------------------------------------------

alter table public.sale_payments
  add column if not exists entry             text check (entry in ('scan', 'typed')),
  add column if not exists scan_id           uuid references public.receipt_scans (id) on delete set null,
  add column if not exists receipt_amount    numeric(12, 2),
  add column if not exists receipt_reference text,
  add column if not exists override_id       uuid references public.payment_overrides (id) on delete restrict;

comment on column public.sale_payments.entry is 'E-payments: scan (read from a receipt photo) or typed by hand.';
comment on column public.sale_payments.receipt_amount is 'The amount the scanned receipt showed, when it showed one.';
comment on column public.sale_payments.receipt_reference is 'The reference the scanned receipt showed, so a change by hand can be seen.';

update public.sale_payments set entry = 'typed' where method = 'e_payment' and entry is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sale_payments_entry_shape') then
    alter table public.sale_payments
      add constraint sale_payments_entry_shape check (
        (method = 'cash' and entry is null and scan_id is null and override_id is null)
        or (method = 'e_payment' and entry is not null and (entry = 'scan' or scan_id is null))
      );
  end if;
end;
$$;

create unique index if not exists sale_payments_scan_key on public.sale_payments (scan_id) where scan_id is not null;
create unique index if not exists sale_payments_override_key on public.sale_payments (override_id) where override_id is not null;


-- -----------------------------------------------------------------------------
-- 3. rpc('create_pos_sale', { p_items, p_payments, p_request_id })
--   An e-payment part may carry scan_id (the scan it was read from) and
--   override_id (the owner's approval for an amount different from the receipt).
-- -----------------------------------------------------------------------------

create or replace function public.create_pos_sale(
  p_items      jsonb,
  p_payments   jsonb,
  p_request_id uuid default null
)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_sale       public.sales;
  v_subtotal   numeric(12, 2) := 0;
  v_item       record;
  v_variant    public.product_variants;
  v_part       record;
  v_provider   public.payment_providers;
  v_scan       public.receipt_scans;
  v_override   public.payment_overrides;
  v_ref        text;
  v_amount     numeric;  -- unbounded, so an oversized amount is refused below rather than overflowing
  v_cash       numeric(12, 2) := 0;
  v_cash_parts integer := 0;
  v_epay       numeric(12, 2) := 0;
  v_paid       numeric(12, 2);
  v_parts      jsonb := '[]'::jsonb;
  v_taken      text;
  v_scan_id    uuid;
  v_override_id uuid;
  v_read_amount numeric;
  v_read_ref   text;
  v_uuid       constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
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

  if p_payments is null or jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'A sale needs at least one payment' using errcode = '22023';
  end if;
  if jsonb_array_length(p_payments) > 50 then
    raise exception 'A sale can take at most 50 payments' using errcode = '22023';
  end if;

  -- Check every payment part before anything is written.
  for v_part in
    select e.value as part, e.ordinality::integer as position
    from jsonb_array_elements(p_payments) with ordinality e
    order by e.ordinality
  loop
    if jsonb_typeof(v_part.part) <> 'object' or jsonb_typeof(v_part.part -> 'amount') is distinct from 'number' then
      raise exception 'Payment % needs an amount', v_part.position
        using errcode = '22023', detail = 'payment:' || v_part.position || ':amount';
    end if;
    v_amount := round((v_part.part ->> 'amount')::numeric, 2);
    if v_amount <= 0 or v_amount >= 10000000 then
      raise exception 'Payment % needs an amount above ₱0', v_part.position
        using errcode = '22023', detail = 'payment:' || v_part.position || ':amount';
    end if;

    case v_part.part ->> 'method'
      when 'cash' then
        v_cash_parts := v_cash_parts + 1;
        if v_cash_parts > 1 then
          raise exception 'Put all the cash in one payment' using errcode = '22023', detail = 'payment:' || v_part.position || ':cash_twice';
        end if;
        v_cash := v_cash + v_amount;
        v_parts := v_parts || jsonb_build_object('position', v_part.position, 'method', 'cash', 'amount', v_amount);

      when 'e_payment' then
        select * into v_provider from public.payment_providers where code = v_part.part ->> 'provider';
        if not found or not v_provider.is_active then
          raise exception 'Payment %: that provider isn''t accepted', v_part.position
            using errcode = '22023', detail = 'payment:' || v_part.position || ':provider';
        end if;

        v_ref := upper(regexp_replace(coalesce(v_part.part ->> 'reference', ''), '[\s-]', '', 'g'));
        if v_ref !~ v_provider.reference_pattern then
          raise exception 'The % reference number doesn''t look right', v_provider.name
            using errcode = '22023', detail = 'payment:' || v_part.position || ':reference';
        end if;

        if exists (
          select 1 from jsonb_array_elements(v_parts) x
          where x ->> 'provider' = v_provider.code and x ->> 'reference' = v_ref
        ) then
          raise exception 'The same % reference is in this sale twice', v_provider.name
            using errcode = '23505', detail = 'payment:' || v_part.position || ':duplicate';
        end if;

        -- A friendlier refusal than the unique index's, naming the sale. Two registers
        -- racing with one reference still meet the index when the second inserts.
        select s.receipt_number into v_taken
        from public.sale_payments sp
        join public.sales s on s.id = sp.sale_id
        where sp.provider = v_provider.code and sp.reference = v_ref and sp.voided_at is null
        limit 1;
        if v_taken is not null then
          raise exception 'That % reference is already on sale %', v_provider.name, v_taken
            using errcode = '23505', detail = 'payment:' || v_part.position || ':duplicate:' || v_taken;
        end if;

        -- Read from a receipt photo: the cashier's own scan, read, recent, and unused.
        v_scan_id := null;
        v_override_id := null;
        v_read_amount := null;
        v_read_ref := null;
        if nullif(v_part.part ->> 'scan_id', '') is not null then
          if (v_part.part ->> 'scan_id') !~ v_uuid then
            raise exception 'Payment %: that receipt scan isn''t valid', v_part.position
              using errcode = '22023', detail = 'payment:' || v_part.position || ':scan';
          end if;
          select * into v_scan from public.receipt_scans where id = (v_part.part ->> 'scan_id')::uuid for update;
          if not found
             or v_scan.scanned_by <> v_uid
             or v_scan.outcome <> 'read'
             or v_scan.sale_id is not null
             or v_scan.created_at < now() - interval '1 day'
             or exists (select 1 from jsonb_array_elements(v_parts) x where x ->> 'scan_id' = v_scan.id::text) then
            raise exception 'Payment %: that receipt scan can''t be used', v_part.position
              using errcode = '22023', detail = 'payment:' || v_part.position || ':scan';
          end if;
          v_scan_id := v_scan.id;
          if jsonb_typeof(v_scan.reading -> 'fields' -> 'amount') = 'number' then
            v_read_amount := round((v_scan.reading -> 'fields' ->> 'amount')::numeric, 2);
          end if;
          v_read_ref := nullif(v_scan.reading -> 'fields' ->> 'reference', '');

          -- An amount different from the receipt needs the owner's approval for exactly this payment.
          if v_read_amount is not null and v_read_amount <> v_amount then
            if nullif(v_part.part ->> 'override_id', '') is null or (v_part.part ->> 'override_id') !~ v_uuid then
              raise exception 'The amount differs from the receipt, so the owner needs to approve it'
                using errcode = 'P0001', detail = 'payment:' || v_part.position || ':needs_override';
            end if;
            select * into v_override from public.payment_overrides where id = (v_part.part ->> 'override_id')::uuid for update;
            if not found
               or v_override.used_at is not null
               or v_override.created_at < now() - interval '10 minutes'
               or v_override.requested_by <> v_uid
               or v_override.provider <> v_provider.code
               or v_override.reference <> v_ref
               or v_override.amount <> v_amount
               or not exists (select 1 from public.profiles p where p.id = v_override.approved_by and p.role = 'owner') then
              raise exception 'The owner''s approval doesn''t match this payment or has expired'
                using errcode = 'P0001', detail = 'payment:' || v_part.position || ':needs_override';
            end if;
            v_override_id := v_override.id;
          end if;
        end if;

        v_epay := v_epay + v_amount;
        v_parts := v_parts || jsonb_build_object(
          'position', v_part.position, 'method', 'e_payment', 'provider', v_provider.code, 'reference', v_ref, 'amount', v_amount,
          'entry', case when v_scan_id is null then 'typed' else 'scan' end,
          'scan_id', v_scan_id, 'override_id', v_override_id, 'receipt_amount', v_read_amount, 'receipt_reference', v_read_ref
        );

      else
        raise exception 'Payment % needs a method', v_part.position
          using errcode = '22023', detail = 'payment:' || v_part.position || ':method';
    end case;
  end loop;

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

  -- The total is the database's, whatever the register last showed.
  v_paid := v_cash + v_epay;
  if v_paid < v_subtotal then
    raise exception 'Amount paid (₱%) is less than the total (₱%)', v_paid, v_subtotal
      using errcode = 'P0001', detail = 'payment:short';
  end if;
  -- Change is cash, so cash on top of e-payments that already cover the total only comes back out.
  if v_cash > 0 and v_epay >= v_subtotal then
    raise exception 'The e-payments already cover the total, so no cash is needed' using errcode = 'P0001', detail = 'payment:cash_not_needed';
  end if;

  insert into public.sales (cashier_id, subtotal, amount_paid, change_amount, payment_method, request_id)
  values (
    v_uid, v_subtotal, v_paid, v_paid - v_subtotal,
    (case when v_cash > 0 and v_epay > 0 then 'mixed' when v_epay > 0 then 'e_payment' else 'cash' end)::public.payment_method,
    p_request_id
  )
  returning * into v_sale;

  insert into public.sale_payments (
    sale_id, position, method, provider, reference, amount, check_status,
    entry, scan_id, override_id, receipt_amount, receipt_reference
  )
  select
    v_sale.id,
    (x ->> 'position')::smallint,
    (x ->> 'method')::public.payment_method,
    x ->> 'provider',
    x ->> 'reference',
    (x ->> 'amount')::numeric,
    case when x ->> 'method' = 'e_payment' then 'cashier_confirmed' end,
    x ->> 'entry',
    nullif(x ->> 'scan_id', '')::uuid,
    nullif(x ->> 'override_id', '')::uuid,
    nullif(x ->> 'receipt_amount', '')::numeric,
    x ->> 'receipt_reference'
  from jsonb_array_elements(v_parts) x;

  -- The sale claims its scans and the owner's approvals, so neither can be used again.
  update public.receipt_scans set sale_id = v_sale.id
  where id in (select nullif(x ->> 'scan_id', '')::uuid from jsonb_array_elements(v_parts) x);
  update public.payment_overrides set used_at = now(), sale_id = v_sale.id
  where id in (select nullif(x ->> 'override_id', '')::uuid from jsonb_array_elements(v_parts) x);

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

revoke execute on function public.create_pos_sale(jsonb, jsonb, uuid) from public, anon;
grant execute on function public.create_pos_sale(jsonb, jsonb, uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 4. rpc('check_sale_payment', { p_payment_id, p_status, p_note })   owner only
--   matched: found in the shop's bank or e-wallet; disputed: not found or wrong
--   (a reason is required); cashier_confirmed: back to be checked.
-- -----------------------------------------------------------------------------

create or replace function public.check_sale_payment(
  p_payment_id uuid,
  p_status     text,
  p_note       text default null
)
returns public.sale_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_payment public.sale_payments;
  v_note    text := nullif(left(btrim(coalesce(p_note, '')), 300), '');
begin
  if v_uid is null or not public.is_owner() then
    raise exception 'Only the owner can check e-payments' using errcode = '42501';
  end if;
  if p_status not in ('matched', 'disputed', 'cashier_confirmed') then
    raise exception 'Unknown check' using errcode = '22023';
  end if;
  if p_status = 'disputed' and (v_note is null or length(v_note) < 3) then
    raise exception 'Say what''s wrong with the payment' using errcode = '22023';
  end if;

  select * into v_payment from public.sale_payments where id = p_payment_id for update;
  if not found or v_payment.method <> 'e_payment' then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;

  update public.sale_payments
  set check_status = p_status,
      checked_by   = case when p_status = 'cashier_confirmed' then null else v_uid end,
      checked_at   = case when p_status = 'cashier_confirmed' then null else now() end,
      check_note   = case when p_status = 'cashier_confirmed' then null else v_note end
  where id = p_payment_id
  returning * into v_payment;

  return v_payment;
end;
$$;

revoke execute on function public.check_sale_payment(uuid, text, text) from public, anon;
grant execute on function public.check_sale_payment(uuid, text, text) to authenticated;
