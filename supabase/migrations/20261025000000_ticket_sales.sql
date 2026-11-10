-- =============================================================================
-- Ticket sales (Phase T3 of docs/ticket-plan.md)
-- =============================================================================
-- The counter charges a customer's ticket:
--   * counter_tickets.sale_id: the sale that paid it;
--   * rpc('create_ticket_sale'): checks the ticket is open and not expired, records
--     the sale through create_pos_sale (same items, payments, and checks as any
--     sale), marks the ticket paid, and tells the customer, all in one step, so a
--     ticket is never charged twice. A retried Charge with the same key returns the
--     same sale;
--   * voiding that sale reopens the ticket (it reads as expired once its 3 days
--     are up) and tells the customer;
--   * a customer can read the sale, its lines, and its payments for their own
--     paid ticket (their receipt);
--   * tickets join realtime, so a customer's ticket turns Paid while they watch.
-- Every statement is safe to run again.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The sale that paid a ticket
-- -----------------------------------------------------------------------------

alter table public.counter_tickets
  add column if not exists sale_id uuid references public.sales (id) on delete set null;

comment on column public.counter_tickets.sale_id is 'The sale that paid this ticket. Cleared (and the ticket reopened) if that sale is voided.';

create unique index if not exists counter_tickets_sale_id_key on public.counter_tickets (sale_id) where sale_id is not null;


-- -----------------------------------------------------------------------------
-- 2. rpc('create_ticket_sale', { p_ticket_id, p_items, p_payments, p_request_id })
-- -----------------------------------------------------------------------------
-- Refusals carry DETAIL 'ticket:<state>' (paid, cancelled, replaced, expired,
-- missing) so the counter can say what happened; everything else is create_pos_sale's.

create or replace function public.create_ticket_sale(
  p_ticket_id  uuid,
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
  v_uid    uuid := (select auth.uid());
  v_ticket public.counter_tickets;
  v_sale   public.sales;
begin
  if v_uid is null or not public.is_staff() then
    raise exception 'Only staff or owners can record sales' using errcode = '42501';
  end if;

  select * into v_ticket from public.counter_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'That ticket doesn''t exist.' using errcode = 'P0001', detail = 'ticket:missing';
  end if;

  -- A retried Charge for a ticket this same sale already paid: hand back that sale.
  if v_ticket.status = 'paid' and p_request_id is not null then
    select * into v_sale from public.sales where id = v_ticket.sale_id and request_id = p_request_id;
    if found then
      return v_sale;
    end if;
  end if;

  if v_ticket.status <> 'open' then
    raise exception 'This ticket is %.', case v_ticket.status when 'paid' then 'already paid' else v_ticket.status end
      using errcode = 'P0001', detail = 'ticket:' || v_ticket.status;
  end if;
  if v_ticket.expires_at <= now() then
    raise exception 'This ticket expired.' using errcode = 'P0001', detail = 'ticket:expired';
  end if;

  v_sale := public.create_pos_sale(p_items, p_payments, p_request_id);

  update public.counter_tickets
  set status = 'paid', closed_at = now(), sale_id = v_sale.id
  where id = v_ticket.id;

  insert into public.notifications (user_id, title, message, type, reference_id)
  values (
    v_ticket.customer_id,
    'Ticket ' || v_ticket.code || ' paid',
    'Paid ₱' || to_char(v_sale.subtotal, 'FM999,999,990.00') || ' at the counter. Your receipt is on the ticket.',
    'ticket',
    v_ticket.id
  );

  return v_sale;
end;
$$;

comment on function public.create_ticket_sale(uuid, jsonb, jsonb, uuid) is
  'Staff: charges an open counter ticket through create_pos_sale, marks it paid, and notifies the customer.';

revoke execute on function public.create_ticket_sale(uuid, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.create_ticket_sale(uuid, jsonb, jsonb, uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 3. A voided ticket sale reopens its ticket
-- -----------------------------------------------------------------------------

create or replace function private.reopen_ticket_on_void()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.counter_tickets;
begin
  update public.counter_tickets
  set status = 'open', closed_at = null, sale_id = null
  where sale_id = new.id and status = 'paid'
  returning * into v_ticket;

  if found then
    insert into public.notifications (user_id, title, message, type, reference_id)
    values (
      v_ticket.customer_id,
      'Ticket ' || v_ticket.code || ' is open again',
      case when v_ticket.expires_at > now()
        then 'The shop undid the sale, so nothing was charged. The ticket works at the counter until '
             || to_char(v_ticket.expires_at at time zone 'Asia/Manila', 'Mon FMDD, FMHH12:MI AM') || '.'
        else 'The shop undid the sale, so nothing was charged. The ticket has expired; put its items back in your cart to make a new one.'
      end,
      'ticket',
      v_ticket.id
    );
  end if;
  return new;
end;
$$;

revoke execute on function private.reopen_ticket_on_void() from public, anon, authenticated;

drop trigger if exists sales_reopen_ticket_on_void on public.sales;
create trigger sales_reopen_ticket_on_void
  after update of voided_at on public.sales
  for each row
  when (old.voided_at is null and new.voided_at is not null)
  execute function private.reopen_ticket_on_void();


-- -----------------------------------------------------------------------------
-- 4. A customer reads the sale that paid their ticket (their receipt)
-- -----------------------------------------------------------------------------

drop policy if exists "sales: customer reads own ticket sale" on public.sales;
create policy "sales: customer reads own ticket sale"
  on public.sales for select to authenticated
  using (exists (
    select 1 from public.counter_tickets t
    where t.sale_id = sales.id and t.customer_id = (select auth.uid())
  ));

drop policy if exists "sale_items: customer reads own ticket sale" on public.sale_items;
create policy "sale_items: customer reads own ticket sale"
  on public.sale_items for select to authenticated
  using (exists (
    select 1 from public.counter_tickets t
    where t.sale_id = sale_items.sale_id and t.customer_id = (select auth.uid())
  ));

drop policy if exists "sale_payments: customer reads own ticket sale" on public.sale_payments;
create policy "sale_payments: customer reads own ticket sale"
  on public.sale_payments for select to authenticated
  using (exists (
    select 1 from public.counter_tickets t
    where t.sale_id = sale_payments.sale_id and t.customer_id = (select auth.uid())
  ));


-- -----------------------------------------------------------------------------
-- 5. Realtime: a ticket turns Paid (or opens again) on the customer's screen
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'counter_tickets'
     ) then
    alter publication supabase_realtime add table public.counter_tickets;
  end if;
end;
$$;
