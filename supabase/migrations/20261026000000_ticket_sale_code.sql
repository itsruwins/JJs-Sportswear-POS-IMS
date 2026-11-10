-- =============================================================================
-- The ticket code stays on its sale (follow-up to Phase T3 of docs/ticket-plan.md)
-- =============================================================================
-- Voiding a ticket's sale reopens the ticket and clears counter_tickets.sale_id,
-- so a receipt that found its ticket through that link lost it once voided. Now:
--   * sales.ticket_code: the code of the counter ticket the sale paid, written
--     when the ticket is linked to the sale and never cleared, so a voided
--     receipt still names it;
--   * existing ticket sales are filled in from their tickets. (A ticket sale
--     voided before this update has no link left to fill it from.)
-- Every statement is safe to run again.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The column
-- -----------------------------------------------------------------------------

alter table public.sales
  add column if not exists ticket_code text;

comment on column public.sales.ticket_code is
  'The counter ticket this sale paid (its code). Kept when the sale is voided, though the ticket itself reopens.';


-- -----------------------------------------------------------------------------
-- 2. Written when a ticket is linked to its sale (rpc create_ticket_sale)
-- -----------------------------------------------------------------------------

create or replace function private.stamp_ticket_on_sale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.sales
  set ticket_code = new.code
  where id = new.sale_id
    and ticket_code is distinct from new.code;
  return new;
end;
$$;

revoke execute on function private.stamp_ticket_on_sale() from public, anon, authenticated;

drop trigger if exists counter_tickets_stamp_sale on public.counter_tickets;
create trigger counter_tickets_stamp_sale
  after insert or update of sale_id on public.counter_tickets
  for each row
  when (new.sale_id is not null)
  execute function private.stamp_ticket_on_sale();


-- -----------------------------------------------------------------------------
-- 3. Ticket sales made before this update
-- -----------------------------------------------------------------------------

update public.sales s
set ticket_code = t.code
from public.counter_tickets t
where t.sale_id = s.id
  and s.ticket_code is null;
