-- =============================================================================
-- Custom orders: payment fixes (follow-up to 20261010000000_custom_order_payments.sql)
-- =============================================================================
-- 1. Payments are written only through the payment functions and the customer's
--    own GCash submission. Staff can no longer insert or edit payment rows
--    directly, which skipped the 50% rule, the owner-only exceptions, and the
--    over-payment check.
-- 2. A customer submits only a GCash payment with its 13-digit reference, as
--    "submitted", and can't write the staff note.
-- 3. GCash references are stored as digits only, so the same transfer can't be
--    counted twice by writing it with spaces.
-- 4. An order picked up on the owner's exception can still take its balance.
-- 5. A GCash payment sent before an order was cancelled can still be verified,
--    so it counts toward what the owner can refund. The customer is told about
--    each refund.
-- 6. Only a submitted GCash payment with a reference can be verified.
-- 7. The price can't change once production starts, or drop below what's paid.
-- Run after 20261010000000_custom_order_payments.sql. Safe to run more than once.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1–2. Who can write payments
-- -----------------------------------------------------------------------------

drop policy if exists "payments: staff insert" on public.payments;
drop policy if exists "payments: staff update" on public.payments;

drop policy if exists "payments: customer submit" on public.payments;
create policy "payments: customer submit"
  on public.payments for insert to authenticated
  with check (
    status = 'submitted'
    and method = 'gcash'
    and gcash_reference ~ '^[0-9]{13}$'
    and rejection_reason is null
    and exists (
      select 1 from public.custom_orders o
      where o.id = order_id
        and o.customer_id = (select auth.uid())
        and o.status in ('accepted', 'in_progress', 'ready', 'completed')
    )
  );

revoke insert, update, delete on public.payments from anon, authenticated;
grant insert (order_id, payment_type, amount, method, status, gcash_reference, gcash_screenshot_url)
  on public.payments to authenticated;


-- -----------------------------------------------------------------------------
-- 3. Digits-only GCash references
-- -----------------------------------------------------------------------------

create or replace function private.payment_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status_changed boolean;
begin
  new.gcash_reference := nullif(regexp_replace(coalesce(new.gcash_reference, ''), '[^0-9]', '', 'g'), '');

  if tg_op = 'INSERT' then
    v_status_changed := true;
  else
    v_status_changed := new.status is distinct from old.status;
  end if;

  if v_status_changed then
    if new.status in ('verified', 'rejected') then
      new.verified_by := coalesce(auth.uid(), new.verified_by);
      new.verified_at := now();
    else
      new.verified_by := null;
      new.verified_at := null;
    end if;
  end if;

  return new;
end;
$$;

-- Tidy any reference written with spaces or dashes (status is unchanged, so no stamps move).
update public.payments
set gcash_reference = nullif(regexp_replace(gcash_reference, '[^0-9]', '', 'g'), '')
where gcash_reference ~ '[^0-9]';

alter table public.payments drop constraint if exists payments_gcash_reference_format;
alter table public.payments add constraint payments_gcash_reference_format
  check (gcash_reference is null or gcash_reference ~ '^[0-9]{13}$') not valid;

do $$
begin
  alter table public.payments validate constraint payments_gcash_reference_format;
exception when check_violation then
  raise notice 'Some older payments have a GCash reference that is not 13 digits; new and changed payments are still checked.';
end;
$$;


-- -----------------------------------------------------------------------------
-- 4. Record a payment: also on an order picked up before it was paid in full
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
  v_ref     text := nullif(regexp_replace(coalesce(p_gcash_reference, ''), '[^0-9]', '', 'g'), '');
  v_payment public.payments;
begin
  if v_uid is null or not public.is_staff() then
    raise exception 'Only staff can record payments' using errcode = '42501';
  end if;

  select * into v_order from public.custom_orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.status not in ('accepted', 'in_progress', 'ready', 'completed') then
    raise exception 'Payments are recorded on accepted orders until they''re paid in full' using errcode = 'P0001';
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
-- 4–6. Verify: submitted GCash only; also on completed and cancelled orders
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
  if v_payment.status <> 'submitted' or v_payment.method <> 'gcash' or v_payment.gcash_reference is null then
    raise exception 'Only a submitted GCash payment with its reference can be verified' using errcode = 'P0001';
  end if;
  if v_order.status in ('pending', 'declined') then
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


-- -----------------------------------------------------------------------------
-- 5. Refunds: the customer hears about it; the cancellation stays the reason
--    shown on the order (refund rows are noted as refunds in the history).
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

  insert into public.notifications (user_id, title, message, type, reference_id)
  values (
    v_order.customer_id,
    'Refund recorded',
    format('₱%s was given back on order %s (%s).', v_amount, v_order.order_number, case p_method when 'gcash' then 'GCash' else 'cash' end),
    'custom_order',
    p_order_id
  );

  return v_refund;
end;
$$;


-- -----------------------------------------------------------------------------
-- 7. The price is set while an order is new or accepted, and never below what's paid.
--    Runs as the signed-in user, so the paid sum is inline (staff read payments).
-- -----------------------------------------------------------------------------

create or replace function private.custom_order_guard_price()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_paid numeric;
begin
  if new.total_price is not distinct from old.total_price then
    return new;
  end if;
  if old.status not in ('pending', 'accepted') then
    raise exception 'The price of order % can''t change once production has started', old.order_number
      using errcode = 'P0001';
  end if;
  v_paid := (select coalesce(sum(amount), 0) from public.payments where order_id = new.id and status = 'verified');
  if new.total_price is null or new.total_price < v_paid then
    raise exception 'The price can''t be less than the ₱% already paid', v_paid using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists custom_orders_guard_price on public.custom_orders;
create trigger custom_orders_guard_price
  before update of total_price on public.custom_orders
  for each row execute function private.custom_order_guard_price();
