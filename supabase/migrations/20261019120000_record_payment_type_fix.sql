-- =============================================================================
-- E-payments (E5), follow-up: recording a custom-order payment
-- =============================================================================
-- record_custom_order_payment wrote the payment type as text, which Postgres
-- won't put into the payment_type column without a cast, so recording a payment
-- failed. The fix landed in 20261019000000_custom_order_e_payments.sql while it
-- was being written; this brings a database that ran the earlier copy of that
-- file to the final function. Harmless on a database that already has it.
-- Safe to run more than once.
-- =============================================================================

create or replace function public.record_custom_order_payment(
  p_order_id   uuid,
  p_amount     numeric,
  p_method     public.payment_method,
  p_provider   text default null,
  p_reference  text default null,
  p_proof_path text default null,
  p_note       text default null
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
  v_payment public.payments;
begin
  if v_uid is null or not public.is_staff() then
    raise exception 'Only staff can record payments' using errcode = '42501';
  end if;
  if p_method not in ('cash', 'e_payment') then
    raise exception 'Record cash or an e-payment' using errcode = '22023';
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

  if p_method = 'e_payment' then
    if not exists (select 1 from public.payment_providers where code = p_provider and is_active) then
      raise exception 'That provider isn''t accepted' using errcode = '22023', detail = 'payment:provider';
    end if;
    if nullif(btrim(coalesce(p_reference, '')), '') is null then
      raise exception 'An e-payment needs its reference number' using errcode = '22023', detail = 'payment:reference';
    end if;
  end if;
  if p_proof_path is not null and p_proof_path not like v_order.customer_id::text || '/' || p_order_id::text || '/%' then
    raise exception 'That screenshot isn''t in this order''s folder' using errcode = '22023';
  end if;

  -- The reference's rule and the one-transfer rule are checked as the row is written.
  insert into public.payments (order_id, payment_type, amount, method, status, provider, reference, gcash_screenshot_url, note)
  values (
    p_order_id,
    (case when v_paid < ceil(v_order.total_price / 2) then 'down_payment' else 'balance' end)::public.payment_type,
    v_amount, p_method, 'verified',
    case when p_method = 'e_payment' then p_provider end,
    case when p_method = 'e_payment' then p_reference end,
    case when p_method = 'e_payment' then p_proof_path end,
    nullif(left(btrim(coalesce(p_note, '')), 300), '')
  )
  returning * into v_payment;

  return v_payment;
end;
$$;

revoke execute on function public.record_custom_order_payment(uuid, numeric, public.payment_method, text, text, text, text) from public, anon;
grant execute on function public.record_custom_order_payment(uuid, numeric, public.payment_method, text, text, text, text) to authenticated;
