-- =============================================================================
-- Custom orders: payments, refunds, and the 50% rule
-- =============================================================================
-- 1. Staff record payments they receive (cash, or GCash with its reference and an
--    optional screenshot) through rpc(record_custom_order_payment); these count as
--    verified. Customer-submitted payments are verified or rejected through
--    rpc(verify_payment) / rpc(reject_payment). Any amount, in parts, but never
--    more than what's still due. The first payments count as the down payment
--    until half the total is paid; after that, as the balance.
-- 2. The rule: production can't start until verified payments reach the down
--    payment (half the total, rounded up to the peso), and an order can't be
--    picked up until it's paid in full, unless the owner records an override with
--    a reason (rpc(override_payment_rule)).
-- 3. Refunds: when a paid order is cancelled, the owner records what was given
--    back (rpc(record_refund)), never more than was paid.
-- 4. A GCash reference can be on only one payment that isn't rejected.
-- Run after 20261009120000_custom_order_production_fixes.sql. Safe to run more than once.
-- =============================================================================

alter table public.payments add column if not exists note text;
comment on column public.payments.note is 'Staff note on a recorded payment (who handed it over, which account).';

create unique index if not exists payments_gcash_reference_live_key
  on public.payments (gcash_reference)
  where gcash_reference is not null and status <> 'rejected';

create table if not exists public.custom_order_refunds (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.custom_orders (id) on delete restrict,
  amount      numeric(12, 2) not null check (amount > 0),
  method      public.payment_method not null,
  note        text not null,
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now()
);
comment on table public.custom_order_refunds is 'Money given back on cancelled custom orders. Written only through rpc(record_refund).';
create index if not exists custom_order_refunds_order_id_idx on public.custom_order_refunds (order_id);
create index if not exists custom_order_refunds_created_by_idx on public.custom_order_refunds (created_by);

create table if not exists public.custom_order_overrides (
  order_id    uuid not null references public.custom_orders (id) on delete cascade,
  kind        text not null check (kind in ('production', 'pickup')),
  reason      text not null,
  created_by  uuid not null references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now(),
  primary key (order_id, kind)
);
comment on table public.custom_order_overrides is 'The owner letting an order start production or be picked up before it is paid enough. Written only through rpc(override_payment_rule).';
create index if not exists custom_order_overrides_created_by_idx on public.custom_order_overrides (created_by);

alter table public.custom_order_refunds enable row level security;
alter table public.custom_order_overrides enable row level security;

drop policy if exists "custom_order_refunds: read own or staff" on public.custom_order_refunds;
create policy "custom_order_refunds: read own or staff"
  on public.custom_order_refunds for select to authenticated
  using (
    (select public.is_staff())
    or exists (select 1 from public.custom_orders o where o.id = order_id and o.customer_id = (select auth.uid()))
  );

drop policy if exists "custom_order_overrides: staff read" on public.custom_order_overrides;
create policy "custom_order_overrides: staff read"
  on public.custom_order_overrides for select to authenticated
  using ((select public.is_staff()));

revoke insert, update, delete on public.custom_order_refunds from anon, authenticated;
revoke insert, update, delete on public.custom_order_overrides from anon, authenticated;
grant select on public.custom_order_refunds to authenticated;
grant select on public.custom_order_overrides to authenticated;

-- Staff can attach a GCash screenshot when they record a payment for a customer.
drop policy if exists "payment-proofs: staff upload" on storage.objects;
create policy "payment-proofs: staff upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-proofs' and (select public.is_staff()));


-- -----------------------------------------------------------------------------
-- What an order has been paid: verified payments only.
-- -----------------------------------------------------------------------------

create or replace function private.order_paid(p_order_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(amount), 0) from public.payments where order_id = p_order_id and status = 'verified';
$$;


-- -----------------------------------------------------------------------------
-- Status transitions (replaces the Phase 10 version: the same moves and the
-- "every step before ready" rule, plus the payment rules)
-- -----------------------------------------------------------------------------

create or replace function private.custom_order_before_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_paid numeric;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if old.status in ('declined', 'completed', 'cancelled') then
    raise exception 'Order % is already % and its status can no longer change',
      old.order_number, old.status using errcode = 'P0001';
  end if;
  if not (
       (old.status = 'pending'     and new.status in ('accepted', 'declined', 'cancelled'))
    or (old.status = 'accepted'    and new.status in ('in_progress', 'cancelled'))
    or (old.status = 'in_progress' and new.status in ('ready', 'cancelled'))
    or (old.status = 'ready'       and new.status in ('completed', 'in_progress', 'cancelled'))
  ) then
    raise exception 'Order % can''t go from % to %', old.order_number, old.status, new.status
      using errcode = 'P0001';
  end if;

  case new.status
    when 'accepted' then
      if new.total_price is null then
        raise exception 'Set the total price before accepting order %', new.order_number
          using errcode = 'P0001';
      end if;
      new.accepted_at := coalesce(new.accepted_at, now());
      new.accepted_by := coalesce(new.accepted_by, auth.uid());
    when 'in_progress' then
      if old.status = 'accepted' then
        -- Inline, not private.order_paid(): this trigger runs as the signed-in user.
        v_paid := (select coalesce(sum(amount), 0) from public.payments where order_id = new.id and status = 'verified');
        if v_paid < ceil(new.total_price / 2)
           and not exists (select 1 from public.custom_order_overrides where order_id = new.id and kind = 'production') then
          raise exception 'Record the down payment (₱%) before production starts on order %', ceil(new.total_price / 2), new.order_number
            using errcode = 'P0001';
        end if;
      end if;
    when 'ready' then
      if (select count(*) from public.custom_order_steps where order_id = new.id) < 5 then
        raise exception 'Finish every production step before marking order % ready', new.order_number
          using errcode = 'P0001';
      end if;
      new.ready_at := now();
    when 'completed' then
      v_paid := (select coalesce(sum(amount), 0) from public.payments where order_id = new.id and status = 'verified');
      if v_paid < new.total_price
         and not exists (select 1 from public.custom_order_overrides where order_id = new.id and kind = 'pickup') then
        raise exception 'Collect the balance (₱%) before order % is picked up', new.total_price - v_paid, new.order_number
          using errcode = 'P0001';
      end if;
      new.completed_at := coalesce(new.completed_at, now());
    else
      null;
  end case;
  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- rpc('record_custom_order_payment', { p_order_id, p_amount, p_method,
--      p_gcash_reference, p_proof_path, p_note })   staff only
-- -----------------------------------------------------------------------------

create or replace function public.record_custom_order_payment(
  p_order_id        uuid,
  p_amount          numeric,
  p_method          public.payment_method,
  p_gcash_reference text default null,
  p_proof_path      text default null,
  p_note            text default null
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_order   public.custom_orders;
  v_paid    numeric;
  v_amount  numeric(12, 2) := round(coalesce(p_amount, 0), 2);
  v_ref     text := nullif(regexp_replace(coalesce(p_gcash_reference, ''), '\s', '', 'g'), '');
  v_payment public.payments;
begin
  if v_uid is null or not public.is_staff() then
    raise exception 'Only staff can record payments' using errcode = '42501';
  end if;

  select * into v_order from public.custom_orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.status not in ('accepted', 'in_progress', 'ready') then
    raise exception 'Payments are recorded on accepted orders until pickup' using errcode = 'P0001';
  end if;
  if v_amount <= 0 then
    raise exception 'Enter the amount received' using errcode = '22023';
  end if;

  v_paid := private.order_paid(p_order_id);
  if v_paid + v_amount > v_order.total_price then
    raise exception 'That''s more than the ₱% still due', v_order.total_price - v_paid using errcode = 'P0001';
  end if;

  if p_method = 'gcash' then
    if v_ref is null or v_ref !~ '^[0-9]{13}$' then
      raise exception 'A GCash payment needs the 13-digit GCash reference number' using errcode = '22023';
    end if;
  else
    v_ref := null;
  end if;
  if p_proof_path is not null and p_proof_path not like v_order.customer_id::text || '/' || p_order_id::text || '/%' then
    raise exception 'That screenshot isn''t in this order''s folder' using errcode = '22023';
  end if;

  insert into public.payments (order_id, payment_type, amount, method, status, gcash_reference, gcash_screenshot_url, note)
  values (
    p_order_id,
    case when v_paid < ceil(v_order.total_price / 2) then 'down_payment' else 'balance' end,
    v_amount, p_method, 'verified', v_ref,
    case when p_method = 'gcash' then p_proof_path end,
    nullif(left(btrim(coalesce(p_note, '')), 300), '')
  )
  returning * into v_payment;

  return v_payment;
end;
$$;


-- -----------------------------------------------------------------------------
-- rpc('verify_payment', { p_payment_id }) / rpc('reject_payment', { p_payment_id, p_reason })   staff only
-- -----------------------------------------------------------------------------

create or replace function public.verify_payment(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_order   public.custom_orders;
  v_paid    numeric;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Only staff can verify payments' using errcode = '42501';
  end if;

  select * into v_payment from public.payments where id = p_payment_id;
  if not found then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  -- Lock the order first (the same order every payment function uses), then the payment.
  select * into v_order from public.custom_orders where id = v_payment.order_id for update;
  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.status not in ('pending', 'submitted') then
    raise exception 'This payment was already %', v_payment.status using errcode = 'P0001';
  end if;
  if v_order.status in ('pending', 'declined', 'cancelled', 'completed') then
    raise exception 'Order % is % and can''t take payments', v_order.order_number, v_order.status using errcode = 'P0001';
  end if;
  v_paid := private.order_paid(v_order.id);
  if v_paid + v_payment.amount > v_order.total_price then
    raise exception 'That''s more than the ₱% still due', v_order.total_price - v_paid using errcode = 'P0001';
  end if;

  update public.payments
  set status = 'verified',
      payment_type = case when v_paid < ceil(v_order.total_price / 2) then 'down_payment'::public.payment_type else 'balance'::public.payment_type end
  where id = p_payment_id
  returning * into v_payment;
  return v_payment;
end;
$$;

create or replace function public.reject_payment(p_payment_id uuid, p_reason text)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_reason  text := left(btrim(coalesce(p_reason, '')), 300);
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Only staff can reject payments' using errcode = '42501';
  end if;
  if length(v_reason) < 3 then
    raise exception 'Tell the customer why the payment was rejected' using errcode = '22023';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  if v_payment.status not in ('pending', 'submitted') then
    raise exception 'This payment was already %', v_payment.status using errcode = 'P0001';
  end if;

  update public.payments set status = 'rejected', rejection_reason = v_reason
  where id = p_payment_id
  returning * into v_payment;
  return v_payment;
end;
$$;


-- -----------------------------------------------------------------------------
-- rpc('record_refund', { p_order_id, p_amount, p_method, p_note })   owner only
-- -----------------------------------------------------------------------------

create or replace function public.record_refund(
  p_order_id uuid,
  p_amount   numeric,
  p_method   public.payment_method,
  p_note     text
)
returns public.custom_order_refunds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_order    public.custom_orders;
  v_amount   numeric(12, 2) := round(coalesce(p_amount, 0), 2);
  v_note     text := left(btrim(coalesce(p_note, '')), 300);
  v_left     numeric;
  v_refund   public.custom_order_refunds;
begin
  if v_uid is null or not public.is_owner() then
    raise exception 'Only the owner can record refunds' using errcode = '42501';
  end if;
  if length(v_note) < 3 then
    raise exception 'Note how the refund was given' using errcode = '22023';
  end if;

  select * into v_order from public.custom_orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.status <> 'cancelled' then
    raise exception 'Refunds are recorded on cancelled orders' using errcode = 'P0001';
  end if;

  v_left := private.order_paid(p_order_id)
          - coalesce((select sum(amount) from public.custom_order_refunds where order_id = p_order_id), 0);
  if v_amount <= 0 or v_amount > v_left then
    raise exception 'The refund can be up to ₱%', v_left using errcode = 'P0001';
  end if;

  insert into public.custom_order_refunds (order_id, amount, method, note, created_by)
  values (p_order_id, v_amount, p_method, v_note, v_uid)
  returning * into v_refund;

  insert into public.order_status_history (order_id, status, note, changed_by, created_at)
  values (p_order_id, 'cancelled', format('Refunded ₱%s (%s): %s', v_amount, p_method, v_note), v_uid, clock_timestamp());

  return v_refund;
end;
$$;


-- -----------------------------------------------------------------------------
-- rpc('override_payment_rule', { p_order_id, p_kind, p_reason })   owner only
--   'production': may start before the down payment; 'pickup': may be picked up
--   before it's paid in full. Written to the order's history.
-- -----------------------------------------------------------------------------

create or replace function public.override_payment_rule(
  p_order_id uuid,
  p_kind     text,
  p_reason   text
)
returns public.custom_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_order  public.custom_orders;
  v_reason text := left(btrim(coalesce(p_reason, '')), 300);
begin
  if v_uid is null or not public.is_owner() then
    raise exception 'Only the owner can make an exception' using errcode = '42501';
  end if;
  if p_kind not in ('production', 'pickup') then
    raise exception 'Unknown exception' using errcode = '22023';
  end if;
  if length(v_reason) < 3 then
    raise exception 'Note why the exception is made' using errcode = '22023';
  end if;

  select * into v_order from public.custom_orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if (p_kind = 'production' and v_order.status <> 'accepted') or (p_kind = 'pickup' and v_order.status not in ('in_progress', 'ready')) then
    raise exception 'That exception doesn''t apply to order % right now', v_order.order_number using errcode = 'P0001';
  end if;

  insert into public.custom_order_overrides (order_id, kind, reason, created_by)
  values (p_order_id, p_kind, v_reason, v_uid)
  on conflict (order_id, kind) do update set reason = excluded.reason, created_by = excluded.created_by, created_at = now();

  insert into public.order_status_history (order_id, status, note, changed_by, created_at)
  values (
    p_order_id, v_order.status,
    case p_kind when 'production' then 'Owner let production start before the down payment: ' else 'Owner let it be picked up before full payment: ' end || v_reason,
    v_uid, clock_timestamp()
  );

  return v_order;
end;
$$;


-- -----------------------------------------------------------------------------
-- Live updates for payments, refunds, and exceptions
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['payments', 'custom_order_refunds', 'custom_order_overrides'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

revoke execute on function public.record_custom_order_payment(uuid, numeric, public.payment_method, text, text, text) from public, anon;
revoke execute on function public.verify_payment(uuid) from public, anon;
revoke execute on function public.reject_payment(uuid, text) from public, anon;
revoke execute on function public.record_refund(uuid, numeric, public.payment_method, text) from public, anon;
revoke execute on function public.override_payment_rule(uuid, text, text) from public, anon;
revoke execute on function private.order_paid(uuid) from public, anon, authenticated;
grant execute on function public.record_custom_order_payment(uuid, numeric, public.payment_method, text, text, text) to authenticated;
grant execute on function public.verify_payment(uuid) to authenticated;
grant execute on function public.reject_payment(uuid, text) to authenticated;
grant execute on function public.record_refund(uuid, numeric, public.payment_method, text) to authenticated;
grant execute on function public.override_payment_rule(uuid, text, text) to authenticated;
