-- =============================================================================
-- Design ticket orders (Phase M2 of docs/design-ticket-plan.md)
-- =============================================================================
-- Staff load a customer's design ticket on the POS Designs tab and take it as a
-- counter order:
--   * counter_tickets.status gains 'ordered': the ticket made a counter order and
--     is closed for good (cancelling that order later doesn't reopen it);
--   * counter_tickets.custom_order_id: the order it made (one order per ticket);
--   * rpc('create_ticket_order'): checks the design ticket is open and not expired,
--     places the order through create_counter_order (same pieces, buyer, payment
--     and checks as any counter order), marks the ticket ordered, and tells the
--     customer, all in one step. A retry with the same request key hands back the
--     same order.
-- The order stays a walk-in (customer_id empty), as decided in the plan.
-- Every statement is safe to run again.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 'ordered' tickets and the order they made
-- -----------------------------------------------------------------------------

alter table public.counter_tickets drop constraint if exists counter_tickets_status_check;
alter table public.counter_tickets
  add constraint counter_tickets_status_check check (status in ('open', 'cancelled', 'replaced', 'paid', 'ordered'));

alter table public.counter_tickets
  add column if not exists custom_order_id uuid references public.custom_orders (id) on delete set null;

create unique index if not exists counter_tickets_custom_order_id_key
  on public.counter_tickets (custom_order_id) where custom_order_id is not null;

comment on column public.counter_tickets.status is
  'open (expired once past expires_at), cancelled (back in the cart), replaced (folded into a newer ticket), paid (a ready-made ticket charged as a sale), ordered (a design ticket taken as a counter order).';
comment on column public.counter_tickets.custom_order_id is
  'Design tickets: the counter order this ticket made. The ticket stays ordered even if that order is later cancelled.';


-- -----------------------------------------------------------------------------
-- 2. rpc('create_ticket_order'): a design ticket becomes a counter order
-- -----------------------------------------------------------------------------
-- The arguments after p_ticket_id are create_counter_order's, unchanged: staff can
-- change pieces, buyer, and details from what the ticket held. Refusals about the
-- ticket carry DETAIL 'ticket:<why>': missing, ready (a ready-made ticket), expired,
-- or its status (ordered, paid, cancelled, replaced). Everything else is
-- create_counter_order's own refusal.

create or replace function public.create_ticket_order(
  p_ticket_id  uuid,
  p_items      jsonb,
  p_buyer      jsonb,
  p_details    jsonb,
  p_payments   jsonb,
  p_request_id uuid
)
returns public.custom_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_ticket public.counter_tickets;
  v_order  public.custom_orders;
  v_down   numeric(12, 2);
begin
  if v_uid is null or not public.is_staff() then
    raise exception 'Only staff can take orders at the counter' using errcode = '42501';
  end if;

  select * into v_ticket from public.counter_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'That ticket doesn''t exist.' using errcode = 'P0001', detail = 'ticket:missing';
  end if;
  if v_ticket.kind <> 'design' then
    raise exception 'This is a ready-made ticket. It''s charged as a sale on the Shelf tab.' using errcode = 'P0001', detail = 'ticket:ready';
  end if;

  -- A retried Place order for a ticket this same order already took: hand back that order.
  if v_ticket.status = 'ordered' and p_request_id is not null then
    select * into v_order from public.custom_orders where id = v_ticket.custom_order_id and counter_request_id = p_request_id;
    if found then
      return v_order;
    end if;
  end if;

  if v_ticket.status <> 'open' then
    raise exception 'This ticket is %.', case v_ticket.status when 'ordered' then 'already ordered' when 'paid' then 'already paid' else v_ticket.status end
      using errcode = 'P0001', detail = 'ticket:' || v_ticket.status;
  end if;
  if v_ticket.expires_at <= now() then
    raise exception 'This ticket expired.' using errcode = 'P0001', detail = 'ticket:expired';
  end if;

  v_order := public.create_counter_order(p_items, p_buyer, p_details, p_payments, p_request_id);

  -- An order already placed with this key for something else can't be claimed by the ticket.
  if exists (select 1 from public.counter_tickets where custom_order_id = v_order.id) then
    raise exception 'That order already belongs to another ticket. Reload the page and try again.' using errcode = 'P0001', detail = 'ticket:taken';
  end if;

  update public.counter_tickets
  set status = 'ordered', closed_at = now(), custom_order_id = v_order.id
  where id = v_ticket.id;

  select coalesce(sum(round((e ->> 'amount')::numeric, 2)), 0) into v_down
  from jsonb_array_elements(p_payments) e;

  insert into public.notifications (user_id, title, message, type, reference_id)
  values (
    v_ticket.customer_id,
    'Design ticket ' || v_ticket.code || ' ordered',
    'Ordered at the counter with ₱' || to_char(v_down, 'FM999,999,990.00') || ' down'
      || case when v_order.total_price > v_down
           then '. The rest, ₱' || to_char(v_order.total_price - v_down, 'FM999,999,990.00') || ', is paid at pickup.'
           else ', paid in full.'
         end,
    'ticket',
    v_ticket.id
  );

  return v_order;
end;
$$;

comment on function public.create_ticket_order(uuid, jsonb, jsonb, jsonb, jsonb, uuid) is
  'Staff: takes an open design ticket as a counter order (through create_counter_order), marks it ordered, and notifies the customer. Idempotent on p_request_id.';

revoke execute on function public.create_ticket_order(uuid, jsonb, jsonb, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.create_ticket_order(uuid, jsonb, jsonb, jsonb, jsonb, uuid) to authenticated;
