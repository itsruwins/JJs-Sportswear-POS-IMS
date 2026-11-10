-- =============================================================================
-- Design tickets (Phase M1 of docs/design-ticket-plan.md)
-- =============================================================================
-- Made-to-order designs join the cart and get tickets of their own:
--   * rpc('cart_set') takes a design's sizes too: no stock to check, still at most
--     99 a size. rpc('cart_add_run') adds a whole size run (S x3, M x5, ...) in one
--     step;
--   * counter_tickets.kind: 'ready' (ready-made, as before) or 'design'. A ticket
--     holds one kind only, and a customer has one open ticket of each kind; a new
--     ticket folds in the open one of its own kind (a design ticket keeps the team
--     details it had);
--   * rpc('create_counter_ticket', { p_kind }) makes either kind ('ready' when left
--     out, as before);
--   * counter_tickets.team_name, needed_by, roster: optional team details on a
--     design ticket, set by the customer through rpc('set_ticket_details') while
--     it's open;
--   * rpc('create_ticket_sale') refuses design tickets: they're taken as orders on
--     the POS Designs tab (Phase M2).
-- Every statement is safe to run again.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Ticket kind and team details
-- -----------------------------------------------------------------------------

alter table public.counter_tickets
  add column if not exists kind text not null default 'ready',
  add column if not exists team_name text,
  add column if not exists needed_by date,
  add column if not exists roster text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'counter_tickets_kind_check') then
    alter table public.counter_tickets
      add constraint counter_tickets_kind_check check (kind in ('ready', 'design'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'counter_tickets_team_details_check') then
    alter table public.counter_tickets
      add constraint counter_tickets_team_details_check check (
        (team_name is null or length(team_name) between 1 and 80)
        and (roster is null or length(roster) between 1 and 1500)
        and (kind = 'design' or (team_name is null and needed_by is null and roster is null))
      );
  end if;
end;
$$;

comment on column public.counter_tickets.kind is 'ready: ready-made items, charged as a POS sale. design: made-to-order designs, taken as a counter order.';
comment on column public.counter_tickets.team_name is 'Design tickets: the team, if the customer gave one.';
comment on column public.counter_tickets.needed_by is 'Design tickets: when the team needs them, if given.';
comment on column public.counter_tickets.roster is 'Design tickets: player names and numbers, one per line, if given.';


-- -----------------------------------------------------------------------------
-- 2. rpc('cart_set'): designs too
-- -----------------------------------------------------------------------------
-- Same signature and refusals as before. A design's size has no stock: it's never
-- sold out and caps only at 99.

create or replace function public.cart_set(p_variant_id uuid, p_quantity integer, p_add boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_stock    integer;
  v_sellable boolean;
  v_design   boolean;
  v_current  integer;
  v_want     integer;
begin
  if v_uid is null or public.current_user_role() is distinct from 'customer' then
    raise exception 'Only customer accounts have a cart.' using errcode = '42501';
  end if;
  if p_variant_id is null or p_quantity is null or p_quantity < 0 or p_quantity > 99 then
    raise exception 'Pick between 1 and 99 pieces.' using errcode = '22023';
  end if;

  select quantity into v_current
  from public.cart_items
  where customer_id = v_uid and variant_id = p_variant_id
  for update;

  v_want := case when p_add then coalesce(v_current, 0) + p_quantity else p_quantity end;

  -- Removing always works, even for an item the shop no longer sells.
  if v_want <= 0 then
    delete from public.cart_items where customer_id = v_uid and variant_id = p_variant_id;
    return 0;
  end if;

  select v.stock_quantity, (v.is_active and p.is_active), coalesce(p.made_to_order, false)
  into v_stock, v_sellable, v_design
  from public.product_variants v
  join public.products p on p.id = v.product_id
  where v.id = p_variant_id;

  if not found or not v_sellable then
    raise exception 'This item isn''t sold anymore.' using errcode = 'P0001', detail = 'unavailable';
  end if;
  if not v_design and v_stock <= 0 then
    raise exception 'This size just sold out.' using errcode = 'P0001', detail = 'sold_out';
  end if;

  if v_current is null and (select count(*) from public.cart_items where customer_id = v_uid) >= 50 then
    raise exception 'Your cart holds up to 50 different items.' using errcode = 'P0001', detail = 'full';
  end if;

  v_want := least(v_want, 99, case when v_design then 99 else v_stock end);

  insert into public.cart_items (customer_id, variant_id, quantity)
  values (v_uid, p_variant_id, v_want)
  on conflict (customer_id, variant_id) do update set quantity = excluded.quantity;

  return v_want;
end;
$$;

comment on function public.cart_set(uuid, integer, boolean) is
  'Customer cart: add to (p_add) or set a line; 0 removes. Ready-made caps at stock on hand and refuses sold out; designs cap at 99.';


-- -----------------------------------------------------------------------------
-- 3. rpc('cart_add_run', { p_items }): a design's size run in one step
-- -----------------------------------------------------------------------------
-- p_items: [{ "variant_id": uuid, "quantity": 1..99 }, ...], 1 to 20 sizes. Each adds
-- through cart_set, so every rule above applies; one refusal adds nothing. Returns
-- the pieces now in the cart for those sizes.

create or replace function public.cart_add_run(p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item  jsonb;
  v_total integer := 0;
  v_qty   integer;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'Pick at least one size.' using errcode = '22023';
  end if;
  if (select count(distinct e ->> 'variant_id') from jsonb_array_elements(p_items) e) <> jsonb_array_length(p_items) then
    raise exception 'Each size once, please.' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    begin
      v_qty := (v_item ->> 'quantity')::integer;
    exception when others then
      v_qty := null;
    end;
    if v_qty is null or v_qty < 1 then
      raise exception 'Pick between 1 and 99 pieces.' using errcode = '22023';
    end if;
    v_total := v_total + public.cart_set((v_item ->> 'variant_id')::uuid, v_qty, true);
  end loop;
  return v_total;
end;
$$;

comment on function public.cart_add_run(jsonb) is
  'Customer cart: adds several sizes at once (a design''s size run) through cart_set; all or nothing.';

revoke execute on function public.cart_add_run(jsonb) from public, anon;
grant execute on function public.cart_add_run(jsonb) to authenticated;


-- -----------------------------------------------------------------------------
-- 4. rpc('create_counter_ticket', { p_kind }): one kind per ticket
-- -----------------------------------------------------------------------------
-- The parameter is new, so the old one goes first. Called without it, it makes a
-- ready-made ticket, as before. Refusals carry DETAIL 'empty' when nothing of that
-- kind in the cart can go on a ticket.

drop function if exists public.create_counter_ticket();

create or replace function public.create_counter_ticket(p_kind text default 'ready')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_design boolean := p_kind = 'design';
  v_open   public.counter_tickets;
  v_kept   public.counter_tickets;
  v_ticket uuid;
  v_code   text;
begin
  if v_uid is null or public.current_user_role() is distinct from 'customer' then
    raise exception 'Only customer accounts make counter tickets.' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('ready', 'design') then
    raise exception 'A ticket is for ready-made items or for designs.' using errcode = '22023';
  end if;

  -- One ticket of each kind at a time per customer: two taps at once wait their turn here.
  perform 1 from public.profiles where id = v_uid for update;

  -- Something of this kind has to be in the cart; otherwise an open ticket would only
  -- be swapped for the same items under a new code.
  if not exists (
    select 1
    from public.cart_items c
    join public.product_variants v on v.id = c.variant_id
    join public.products p on p.id = v.product_id
    where c.customer_id = v_uid and v.is_active and p.is_active
      and coalesce(p.made_to_order, false) = v_design
      and (v_design or v.stock_quantity > 0)
  ) then
    raise exception '%', case when v_design then 'There are no designs in your cart.' else 'Nothing in your cart can be bought right now.' end
      using errcode = 'P0001', detail = 'empty';
  end if;

  -- An open ticket of this kind that hasn't expired folds into the new one. A design
  -- ticket's team details carry over (the newest one's, if somehow there are two).
  for v_open in
    select * from public.counter_tickets
    where customer_id = v_uid and kind = p_kind and status = 'open' and expires_at > now()
    order by created_at
  loop
    v_kept := v_open;
    perform private.ticket_back_to_cart(v_open.id, 'replaced');
  end loop;

  v_code := private.new_ticket_code();
  insert into public.counter_tickets (code, customer_id, kind, team_name, needed_by, roster)
  values (
    v_code, v_uid, p_kind,
    case when v_design then v_kept.team_name end,
    case when v_design and v_kept.needed_by >= (now() at time zone 'Asia/Manila')::date then v_kept.needed_by end,
    case when v_design then v_kept.roster end
  )
  returning id into v_ticket;

  -- Designs list by design, style, and size order as the cart has them; ready-made by when added.
  insert into public.counter_ticket_items (ticket_id, position, variant_id, product_name, size, color, unit_price, quantity)
  select v_ticket,
         row_number() over (order by c.created_at, c.variant_id),
         c.variant_id, p.name, v.size, v.color, v.price,
         case when v_design then c.quantity else least(c.quantity, v.stock_quantity) end
  from public.cart_items c
  join public.product_variants v on v.id = c.variant_id
  join public.products p on p.id = v.product_id
  where c.customer_id = v_uid and v.is_active and p.is_active
    and coalesce(p.made_to_order, false) = v_design
    and (v_design or v.stock_quantity > 0);

  -- The lines that went into the ticket leave the cart; everything else stays.
  delete from public.cart_items c
  where c.customer_id = v_uid
    and c.variant_id in (select i.variant_id from public.counter_ticket_items i where i.ticket_id = v_ticket);

  return v_code;
end;
$$;

comment on function public.create_counter_ticket(text) is
  'Customer: moves the cart''s ready-made (p_kind ready) or design (p_kind design) lines into a new ticket of that kind; an open one of the same kind folds in first. Returns the code.';

revoke execute on function public.create_counter_ticket(text) from public, anon;
grant execute on function public.create_counter_ticket(text) to authenticated;


-- -----------------------------------------------------------------------------
-- 5. rpc('set_ticket_details'): team details on an open design ticket
-- -----------------------------------------------------------------------------
-- Blank fields are cleared. Refusals carry DETAIL 'closed' (not open, or expired),
-- 'kind' (a ready-made ticket), or 'needed_by' (a date that has passed).

create or replace function public.set_ticket_details(
  p_ticket_id uuid,
  p_team      text,
  p_needed_by date,
  p_roster    text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_ticket public.counter_tickets;
  v_team   text := nullif(left(btrim(regexp_replace(coalesce(p_team, ''), '\s+', ' ', 'g')), 80), '');
  v_roster text := nullif(left(btrim(coalesce(p_roster, '')), 1500), '');
begin
  if v_uid is null or public.current_user_role() is distinct from 'customer' then
    raise exception 'Only customer accounts have counter tickets.' using errcode = '42501';
  end if;

  select * into v_ticket
  from public.counter_tickets
  where id = p_ticket_id and customer_id = v_uid
  for update;
  if not found then
    raise exception 'That ticket doesn''t exist.' using errcode = 'P0002';
  end if;
  if v_ticket.kind <> 'design' then
    raise exception 'Only design tickets have team details.' using errcode = 'P0001', detail = 'kind';
  end if;
  if v_ticket.status <> 'open' or v_ticket.expires_at <= now() then
    raise exception 'This ticket can''t be changed anymore.' using errcode = 'P0001', detail = 'closed';
  end if;
  if p_needed_by is not null and p_needed_by < (now() at time zone 'Asia/Manila')::date then
    raise exception 'That date has already passed.' using errcode = '22023', detail = 'needed_by';
  end if;

  update public.counter_tickets
  set team_name = v_team, needed_by = p_needed_by, roster = v_roster
  where id = v_ticket.id;
end;
$$;

comment on function public.set_ticket_details(uuid, text, date, text) is
  'Customer: sets the optional team name, needed-by date, and names/numbers on their open design ticket.';

revoke execute on function public.set_ticket_details(uuid, text, date, text) from public, anon;
grant execute on function public.set_ticket_details(uuid, text, date, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 6. rpc('create_ticket_sale'): ready-made tickets only
-- -----------------------------------------------------------------------------
-- As in 20261025000000_ticket_sales.sql, plus DETAIL 'ticket:design' for a design ticket.

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
  if v_ticket.kind = 'design' then
    raise exception 'This is a design ticket. It''s taken as an order on the Designs tab.' using errcode = 'P0001', detail = 'ticket:design';
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
