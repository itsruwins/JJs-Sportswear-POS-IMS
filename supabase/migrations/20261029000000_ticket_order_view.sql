-- =============================================================================
-- The customer after ordering (Phase M3 of docs/design-ticket-plan.md)
-- =============================================================================
-- A design ticket taken at the counter makes a walk-in order (customer_id empty),
-- so until now the customer who made the ticket couldn't see it. This lets them
-- follow it through the ticket, without putting their account on the order:
--   * read only: a customer can read a counter order, its items, and its payments
--     when the order came from one of their own tickets. Every write still needs
--     the order to be their own (customer_id), so they can't pay or cancel it
--     online; the balance is paid at pickup;
--   * news: the order's status and payment notices, which had no recipient on a
--     walk-in order and were skipped, now go to the ticket's customer and open the
--     ticket (type 'ticket', reference the ticket).
-- Every statement is safe to run again.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Read the order through the ticket
-- -----------------------------------------------------------------------------

drop policy if exists "custom_orders: customer reads own ticket order" on public.custom_orders;
create policy "custom_orders: customer reads own ticket order"
  on public.custom_orders for select to authenticated
  using (
    exists (
      select 1 from public.counter_tickets t
      where t.custom_order_id = custom_orders.id and t.customer_id = (select auth.uid())
    )
  );

drop policy if exists "custom_order_items: customer reads own ticket order" on public.custom_order_items;
create policy "custom_order_items: customer reads own ticket order"
  on public.custom_order_items for select to authenticated
  using (
    exists (
      select 1 from public.counter_tickets t
      where t.custom_order_id = custom_order_items.order_id and t.customer_id = (select auth.uid())
    )
  );

drop policy if exists "payments: customer reads own ticket order" on public.payments;
create policy "payments: customer reads own ticket order"
  on public.payments for select to authenticated
  using (
    exists (
      select 1 from public.counter_tickets t
      where t.custom_order_id = payments.order_id and t.customer_id = (select auth.uid())
    )
  );


-- -----------------------------------------------------------------------------
-- 2. A walk-in order's news goes to the ticket's customer
-- -----------------------------------------------------------------------------
-- The trigger from 20261022000000_counter_design_orders.sql runs before a
-- notification with no recipient is saved. It used to drop every one; now, when
-- the notice is about an order (or a payment on one) that a ticket made, it goes
-- to that ticket's customer and opens the ticket. Anything else is still dropped.
-- An order is linked to its ticket only after create_counter_order finishes, so
-- the "accepted" and payment notices from taking the order aren't sent twice
-- (create_ticket_order sends its own "ordered" notice).

create or replace function private.skip_notification_without_recipient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.counter_tickets;
begin
  if new.reference_id is not null then
    select t.* into v_ticket
    from public.counter_tickets t
    where t.custom_order_id = new.reference_id
       or t.custom_order_id = (select p.order_id from public.payments p where p.id = new.reference_id)
    limit 1;
    if found then
      new.user_id := v_ticket.customer_id;
      new.type := 'ticket';
      new.reference_id := v_ticket.id;
      return new;
    end if;
  end if;
  return null;
end;
$$;

comment on function private.skip_notification_without_recipient() is
  'Before insert on notifications with no recipient: a notice about an order a design ticket made goes to that ticket''s customer; anything else is dropped.';
