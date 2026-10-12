-- =============================================================================
-- E-payments (E1), part 2 of 2: providers, payment parts, and the sale function
-- =============================================================================
-- Needs 20261016000000_e_payment_methods.sql to have run first.
--
-- 1. payment_providers lists the e-wallets and banks the shop accepts, each with
--    its own reference-number rule. GCash keeps its confirmed 13 digits; the
--    others start with a general rule (6–40 letters and digits) until a real
--    receipt confirms their format. Everyone signed in reads the list; only the
--    owner changes it. Rules apply to the cleaned reference: upper case, with
--    spaces and dashes removed.
-- 2. sale_payments holds each part of a sale's payment: cash, or an e-payment
--    with its provider, reference, and amount. A sale can be paid in any mix.
--    Anything paid above the total comes back as cash change.
-- 3. A reference can be on only one standing sale per provider (voided sales
--    don't count), enforced by a unique index so two registers can't both use it.
-- 4. E-payments are recorded as 'cashier_confirmed': the cashier saw the
--    customer's receipt. Nobody has checked the bank yet; the owner can later
--    mark each one 'matched' or 'disputed'.
-- 5. create_pos_sale takes the payment parts; void_pos_sale also frees their
--    references. Items, stock checks, the one-time sale key, and the stock
--    deduction work as before.
-- 6. Every existing sale gets its payment rows, and GCash sales become
--    e_payment · GCash. sales.gcash_reference stays for history.
-- 7. sales_report gives cash, e-payment, and per-provider totals.
-- 8. Custom-order payments keep cash and GCash until they get the providers too.
-- Every statement is safe to run again.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Providers
-- -----------------------------------------------------------------------------

create table if not exists public.payment_providers (
  code              text primary key check (code ~ '^[a-z][a-z0-9_]{1,31}$'),
  name              text not null check (length(btrim(name)) between 1 and 40),
  kind              text not null check (kind in ('e_wallet', 'bank')),
  reference_pattern text not null,
  reference_hint    text not null check (length(btrim(reference_hint)) between 1 and 120),
  sort_order        integer not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  -- A rule covers the whole reference (anchored), and must be a regular expression
  -- Postgres can read: matching it against '' raises an error when it isn't.
  constraint payment_providers_pattern_valid
    check (reference_pattern ~ '^\^.*\$$' and ('' ~ reference_pattern) is not null)
);

comment on table public.payment_providers is 'E-wallets and banks the shop accepts, with the rule a reference number must follow.';
comment on column public.payment_providers.reference_pattern is 'Regular expression for the cleaned reference (upper case, spaces and dashes removed).';
comment on column public.payment_providers.reference_hint is 'Where the cashier finds the reference on the receipt, shown under the field.';

-- New rows only: a rule the owner has changed is never put back.
insert into public.payment_providers (code, name, kind, reference_pattern, reference_hint, sort_order) values
  ('gcash',     'GCash',       'e_wallet', '^[0-9]{13}$',       'The 13-digit Ref No. on the GCash receipt.',                 10),
  ('maya',      'Maya',        'e_wallet', '^[A-Z0-9]{6,40}$',  'The reference or transaction number on the Maya receipt.',  20),
  ('maribank',  'MariBank',    'bank',     '^[A-Z0-9]{6,40}$',  'The reference number on the MariBank receipt.',             30),
  ('unionbank', 'UnionBank',   'bank',     '^[A-Z0-9]{6,40}$',  'The reference number on the UnionBank receipt.',            40),
  ('gotyme',    'GoTyme Bank', 'bank',     '^[A-Z0-9]{6,40}$',  'The reference number on the GoTyme Bank receipt.',          50),
  ('bdo',       'BDO',         'bank',     '^[A-Z0-9]{6,40}$',  'The reference number on the BDO receipt.',                  60),
  ('bpi',       'BPI',         'bank',     '^[A-Z0-9]{6,40}$',  'The reference number on the BPI receipt.',                  70),
  ('metrobank', 'Metrobank',   'bank',     '^[A-Z0-9]{6,40}$',  'The reference number on the Metrobank receipt.',            80)
on conflict (code) do nothing;

alter table public.payment_providers enable row level security;

drop policy if exists "payment_providers: signed-in read" on public.payment_providers;
create policy "payment_providers: signed-in read"
  on public.payment_providers for select to authenticated
  using (true);

drop policy if exists "payment_providers: owner insert" on public.payment_providers;
create policy "payment_providers: owner insert"
  on public.payment_providers for insert to authenticated
  with check ((select public.is_owner()));

drop policy if exists "payment_providers: owner update" on public.payment_providers;
create policy "payment_providers: owner update"
  on public.payment_providers for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- Providers are switched off, never deleted: past sales point to them.
revoke insert, update, delete on public.payment_providers from anon;
revoke delete on public.payment_providers from authenticated;


-- -----------------------------------------------------------------------------
-- 2. Payment parts
-- -----------------------------------------------------------------------------

create table if not exists public.sale_payments (
  id           uuid primary key default gen_random_uuid(),
  sale_id      uuid not null references public.sales (id) on delete cascade,
  position     smallint not null check (position between 1 and 50),
  method       public.payment_method not null check (method in ('cash', 'e_payment')),
  provider     text references public.payment_providers (code) on delete restrict,
  reference    text,
  amount       numeric(12, 2) not null check (amount >= 0),
  check_status text check (check_status in ('cashier_confirmed', 'matched', 'disputed')),
  checked_by   uuid references public.profiles (id) on delete restrict,
  checked_at   timestamptz,
  check_note   text check (check_note is null or length(check_note) <= 300),
  voided_at    timestamptz,
  created_at   timestamptz not null default now(),
  constraint sale_payments_position_key unique (sale_id, position),
  constraint sale_payments_shape check (
    (method = 'cash' and provider is null and reference is null and check_status is null)
    or (method = 'e_payment' and provider is not null and check_status is not null)
  ),
  constraint sale_payments_check_complete check (
    coalesce(check_status, 'cashier_confirmed') = 'cashier_confirmed'
    or (checked_by is not null and checked_at is not null)
  ),
  constraint sale_payments_dispute_reason check (check_status is distinct from 'disputed' or check_note is not null)
);

comment on table public.sale_payments is 'The parts of a POS sale''s payment. Written by rpc(create_pos_sale) only.';
comment on column public.sale_payments.reference is 'Cleaned reference number (upper case, no spaces or dashes). Text, so leading zeros stay.';
comment on column public.sale_payments.check_status is 'E-payments: cashier_confirmed (receipt seen at the counter), then matched or disputed once the owner checks the bank.';
comment on column public.sale_payments.voided_at is 'Copied from the sale when it is voided, so the reference can be used again.';

create index if not exists sale_payments_sale_id_idx on public.sale_payments (sale_id);
create index if not exists sale_payments_checks_idx on public.sale_payments (check_status, created_at desc) where method = 'e_payment';

create unique index if not exists sale_payments_reference_live_key
  on public.sale_payments (provider, reference)
  where reference is not null and voided_at is null;

alter table public.sale_payments enable row level security;

drop policy if exists "sale_payments: staff read" on public.sale_payments;
create policy "sale_payments: staff read"
  on public.sale_payments for select to authenticated
  using ((select public.is_staff()));

revoke insert, update, delete on public.sale_payments from anon, authenticated;


-- -----------------------------------------------------------------------------
-- 6. Existing sales get their payment rows (before the functions change, so a
--    GCash reference already used can't be taken by a new sale).
-- -----------------------------------------------------------------------------

insert into public.sale_payments (sale_id, position, method, provider, reference, amount, check_status, voided_at, created_at)
select
  s.id,
  1,
  (case when s.payment_method = 'gcash' then 'e_payment' else 'cash' end)::public.payment_method,
  case when s.payment_method = 'gcash' then 'gcash' end,
  case when s.payment_method = 'gcash' then s.gcash_reference end,
  s.amount_paid,
  case when s.payment_method = 'gcash' then 'cashier_confirmed' end,
  s.voided_at,
  s.created_at
from public.sales s
where s.payment_method in ('cash', 'gcash')
  and not exists (select 1 from public.sale_payments p where p.sale_id = s.id);

update public.sales set payment_method = 'e_payment' where payment_method = 'gcash';

comment on column public.sales.gcash_reference is 'History only: GCash references from before sale_payments. New sales keep references in sale_payments.';

do $$
begin
  -- GCash sales from before references were required have none, so this holds for new rows only.
  if not exists (select 1 from pg_constraint where conname = 'sale_payments_reference_required') then
    alter table public.sale_payments
      add constraint sale_payments_reference_required check (method <> 'e_payment' or reference is not null) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_payment_method_kind') then
    alter table public.sales
      add constraint sales_payment_method_kind check (payment_method in ('cash', 'e_payment', 'mixed'));
  end if;
  -- 8. Custom-order payments stay cash or GCash for now.
  if not exists (select 1 from pg_constraint where conname = 'payments_method_supported') then
    alter table public.payments
      add constraint payments_method_supported check (method in ('cash', 'gcash'));
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- 5. rpc('create_pos_sale', { p_items, p_payments, p_request_id })
--   p_payments: [{ method: 'cash', amount }, { method: 'e_payment', provider, reference, amount }, ...]
--   At most one cash part. The parts must cover the total; anything above it is
--   cash change. Refusals name the part in DETAIL ("payment:<n>:<problem>").
-- -----------------------------------------------------------------------------

drop function if exists public.create_pos_sale(jsonb, numeric, public.payment_method);
drop function if exists public.create_pos_sale(jsonb, numeric, public.payment_method, text);
drop function if exists public.create_pos_sale(jsonb, numeric, public.payment_method, text, uuid);

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
  v_ref        text;
  v_amount     numeric;  -- unbounded, so an oversized amount is refused below rather than overflowing
  v_cash       numeric(12, 2) := 0;
  v_cash_parts integer := 0;
  v_epay       numeric(12, 2) := 0;
  v_paid       numeric(12, 2);
  v_parts      jsonb := '[]'::jsonb;
  v_taken      text;
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

        v_epay := v_epay + v_amount;
        v_parts := v_parts || jsonb_build_object(
          'position', v_part.position, 'method', 'e_payment', 'provider', v_provider.code, 'reference', v_ref, 'amount', v_amount
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

  insert into public.sale_payments (sale_id, position, method, provider, reference, amount, check_status)
  select
    v_sale.id,
    (x ->> 'position')::smallint,
    (x ->> 'method')::public.payment_method,
    x ->> 'provider',
    x ->> 'reference',
    (x ->> 'amount')::numeric,
    case when x ->> 'method' = 'e_payment' then 'cashier_confirmed' end
  from jsonb_array_elements(v_parts) x;

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
--   Same as 20261007120000_pos_sale_key.sql, plus: the sale's payment parts are
--   marked void, so their references can be used on another sale.
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

  update public.sale_payments set voided_at = v_sale.voided_at where sale_id = p_sale_id;

  return v_sale;
end;
$$;

revoke execute on function public.create_pos_sale(jsonb, jsonb, uuid) from public, anon;
revoke execute on function public.void_pos_sale(uuid, text) from public, anon;
grant execute on function public.create_pos_sale(jsonb, jsonb, uuid) to authenticated;
grant execute on function public.void_pos_sale(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 7. rpc('sales_report', { p_from, p_to, p_bucket })   owner only
--   Same as 20261008120000_sales_report_ties.sql, with the payment totals from
--   sale_payments:
--     totals.e_payment  e-payments received
--     totals.cash       the rest of the sales total: cash kept after change. An
--                       e-payment above the total is change paid out in cash, so
--                       cash + e_payment always adds up to revenue.
--     totals.providers  [{ code, name, revenue }] e-payments by provider
-- -----------------------------------------------------------------------------

create or replace function public.sales_report(
  p_from   timestamptz,
  p_to     timestamptz,
  p_bucket text default 'day'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.is_owner() then
    raise exception 'Only owners can see sales reports' using errcode = '42501';
  end if;
  if p_to is null or (p_from is not null and p_from >= p_to) then
    raise exception 'The period needs an end after its start' using errcode = '22023';
  end if;
  if p_bucket not in ('hour', 'day', 'month') then
    raise exception 'Bucket must be hour, day, or month' using errcode = '22023';
  end if;

  with period as (
    select s.*
    from public.sales s
    where s.created_at < p_to
      and (p_from is null or s.created_at >= p_from)
  ),
  live as (
    select * from period where voided_at is null
  ),
  lines as (
    select i.quantity, i.subtotal, v.id as variant_id, v.size, v.color, p.id as product_id, p.name
    from live
    join public.sale_items i on i.sale_id = live.id
    join public.product_variants v on v.id = i.variant_id
    join public.products p on p.id = v.product_id
  ),
  pays as (
    select sp.provider, sp.amount
    from live
    join public.sale_payments sp on sp.sale_id = live.id
    where sp.method = 'e_payment'
  )
  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'sales',          (select count(*) from live),
        'revenue',        (select coalesce(sum(subtotal), 0) from live),
        'pieces',         (select coalesce(sum(quantity), 0) from lines),
        'cash',           (select coalesce(sum(subtotal), 0) from live) - (select coalesce(sum(amount), 0) from pays),
        'e_payment',      (select coalesce(sum(amount), 0) from pays),
        'voided',         (select count(*) from period where voided_at is not null),
        'voided_revenue', (select coalesce(sum(subtotal), 0) from period where voided_at is not null),
        'providers', coalesce((
          select jsonb_agg(jsonb_build_object('code', pr.code, 'name', pr.name, 'revenue', t.revenue) order by pr.sort_order, pr.name)
          from (select provider, sum(amount) as revenue from pays group by provider) t
          join public.payment_providers pr on pr.code = t.provider
        ), '[]'::jsonb)
      )
    ),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', bucket, 'sales', sales, 'revenue', revenue) order by bucket)
      from (
        select
          case p_bucket
            when 'hour'  then to_char(created_at at time zone 'Asia/Manila', 'HH24')
            when 'month' then to_char(created_at at time zone 'Asia/Manila', 'YYYY-MM')
            else              to_char(created_at at time zone 'Asia/Manila', 'YYYY-MM-DD')
          end as bucket,
          count(*) as sales,
          sum(subtotal) as revenue
        from live
        group by 1
      ) b
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(row_to_json(t)::jsonb order by t.revenue desc, t.pieces desc, t.name, t.product_id)
      from (
        select product_id, name, sum(quantity) as pieces, sum(subtotal) as revenue
        from lines
        group by product_id, name
        order by revenue desc, pieces desc, name, product_id
        limit 10
      ) t
    ), '[]'::jsonb),
    'variants', coalesce((
      select jsonb_agg(row_to_json(t)::jsonb order by t.pieces desc, t.revenue desc, t.name, t.variant_id)
      from (
        select variant_id, product_id, name, size, color, sum(quantity) as pieces, sum(subtotal) as revenue
        from lines
        group by variant_id, product_id, name, size, color
        order by pieces desc, revenue desc, name, variant_id
        limit 10
      ) t
    ), '[]'::jsonb),
    'cashiers', coalesce((
      select jsonb_agg(row_to_json(t)::jsonb order by t.revenue desc, t.username)
      from (
        select pr.id, pr.username, pr.full_name, count(*) as sales, sum(live.subtotal) as revenue
        from live
        join public.profiles pr on pr.id = live.cashier_id
        group by pr.id, pr.username, pr.full_name
      ) t
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke execute on function public.sales_report(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.sales_report(timestamptz, timestamptz, text) to authenticated;
