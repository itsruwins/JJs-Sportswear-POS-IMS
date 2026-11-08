-- =============================================================================
-- Counter tickets (Phase T2 of docs/ticket-plan.md)
-- =============================================================================
-- A customer turns their cart into a ticket to show at the counter:
--   * counter_tickets: a short code (JJ- and 5 letters or numbers, no look-alikes),
--     good for 3 days; counter_ticket_items: what it lists, with the name, size,
--     color, and price as they were when it was made;
--   * rpc('create_counter_ticket'): the cart's buyable lines move into a new ticket
--     (capped at the stock on hand). An open ticket's items fold into the new one,
--     so a customer has one ticket to show at a time. Sold-out and no-longer-sold
--     lines stay in the cart;
--   * rpc('return_counter_ticket'): an open ticket (expired or not) goes back into
--     the cart, for editing or cancelling;
--   * customers read their own tickets; staff read all (the POS loads them in T3).
-- Stock isn't held. Every statement is safe to run again.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Tickets and their lines
-- -----------------------------------------------------------------------------

create table if not exists public.counter_tickets (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique check (code ~ '^JJ-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$'),
  customer_id  uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'open' check (status in ('open', 'cancelled', 'replaced', 'paid')),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '3 days',
  closed_at    timestamptz,
  check ((status = 'open') = (closed_at is null))
);

comment on table public.counter_tickets is 'A customer''s cart, sealed into a code to show at the counter. Expired = open past expires_at.';
comment on column public.counter_tickets.status is 'open (expired once past expires_at), cancelled (back in the cart), replaced (folded into a newer ticket), paid (T3).';

create index if not exists counter_tickets_customer_idx on public.counter_tickets (customer_id, created_at desc);

create table if not exists public.counter_ticket_items (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references public.counter_tickets (id) on delete cascade,
  position      integer not null,
  variant_id    uuid references public.product_variants (id) on delete set null,
  product_name  text not null,
  size          text,
  color         text,
  unit_price    numeric(12, 2) not null check (unit_price >= 0),
  quantity      integer not null check (quantity between 1 and 99),
  unique (ticket_id, position)
);

comment on table public.counter_ticket_items is 'A ticket''s lines, with name, size, color, and price as they were when it was made.';

create index if not exists counter_ticket_items_variant_idx on public.counter_ticket_items (variant_id);


-- -----------------------------------------------------------------------------
-- 2. Access: read only; every write goes through the functions below
-- -----------------------------------------------------------------------------

alter table public.counter_tickets enable row level security;
alter table public.counter_ticket_items enable row level security;

revoke all on public.counter_tickets, public.counter_ticket_items from anon;
revoke insert, update, delete on public.counter_tickets, public.counter_ticket_items from authenticated;
grant select on public.counter_tickets, public.counter_ticket_items to authenticated;

drop policy if exists "counter_tickets: read own or staff" on public.counter_tickets;
create policy "counter_tickets: read own or staff"
  on public.counter_tickets for select to authenticated
  using (customer_id = (select auth.uid()) or (select public.is_staff()));

drop policy if exists "counter_ticket_items: read with ticket" on public.counter_ticket_items;
create policy "counter_ticket_items: read with ticket"
  on public.counter_ticket_items for select to authenticated
  using (
    (select public.is_staff())
    or exists (select 1 from public.counter_tickets t where t.id = ticket_id and t.customer_id = (select auth.uid()))
  );


-- -----------------------------------------------------------------------------
-- 3. Helpers
-- -----------------------------------------------------------------------------

-- A fresh code: JJ- and 5 of 31 characters (no 0/O, 1/I/L), about 28.6 million in all.
create or replace function private.new_ticket_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_code text;
begin
  loop
    v_code := 'JJ-';
    for i in 1..5 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * 31)::integer, 1);
    end loop;
    exit when not exists (select 1 from public.counter_tickets where code = v_code);
  end loop;
  return v_code;
end;
$$;

-- Puts an open ticket's lines back in its customer's cart and closes it with p_status.
-- Lines whose variant was deleted can't go back; the rest add to what's in the cart.
create or replace function private.ticket_back_to_cart(p_ticket_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.cart_items (customer_id, variant_id, quantity)
  select t.customer_id, i.variant_id, least(sum(i.quantity), 99)
  from public.counter_ticket_items i
  join public.counter_tickets t on t.id = i.ticket_id
  where i.ticket_id = p_ticket_id and i.variant_id is not null
  group by t.customer_id, i.variant_id
  on conflict (customer_id, variant_id)
  do update set quantity = least(public.cart_items.quantity + excluded.quantity, 99);

  update public.counter_tickets
  set status = p_status, closed_at = now()
  where id = p_ticket_id and status = 'open';
end;
$$;

revoke execute on function private.new_ticket_code() from public, anon, authenticated;
revoke execute on function private.ticket_back_to_cart(uuid, text) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 4. rpc('create_counter_ticket'): the cart becomes a ticket; returns its code
-- -----------------------------------------------------------------------------
-- Refusals carry DETAIL 'empty' when nothing in the cart can be bought.

create or replace function public.create_counter_ticket()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_open   uuid;
  v_ticket uuid;
  v_code   text;
begin
  if v_uid is null or public.current_user_role() is distinct from 'customer' then
    raise exception 'Only customer accounts make counter tickets.' using errcode = '42501';
  end if;

  -- One ticket at a time per customer: two taps at once wait their turn here.
  perform 1 from public.profiles where id = v_uid for update;

  -- An open ticket that hasn't expired folds into the new one.
  for v_open in
    select id from public.counter_tickets
    where customer_id = v_uid and status = 'open' and expires_at > now()
  loop
    perform private.ticket_back_to_cart(v_open, 'replaced');
  end loop;

  if not exists (
    select 1
    from public.cart_items c
    join public.product_variants v on v.id = c.variant_id
    join public.products p on p.id = v.product_id
    where c.customer_id = v_uid and v.is_active and p.is_active and not p.made_to_order and v.stock_quantity > 0
  ) then
    raise exception 'Nothing in your cart can be bought right now.' using errcode = 'P0001', detail = 'empty';
  end if;

  v_code := private.new_ticket_code();
  insert into public.counter_tickets (code, customer_id) values (v_code, v_uid) returning id into v_ticket;

  insert into public.counter_ticket_items (ticket_id, position, variant_id, product_name, size, color, unit_price, quantity)
  select v_ticket,
         row_number() over (order by c.created_at, c.variant_id),
         c.variant_id, p.name, v.size, v.color, v.price,
         least(c.quantity, v.stock_quantity)
  from public.cart_items c
  join public.product_variants v on v.id = c.variant_id
  join public.products p on p.id = v.product_id
  where c.customer_id = v_uid and v.is_active and p.is_active and not p.made_to_order and v.stock_quantity > 0;

  -- The lines that went into the ticket leave the cart; sold-out and no-longer-sold ones stay.
  delete from public.cart_items c
  where c.customer_id = v_uid
    and c.variant_id in (select i.variant_id from public.counter_ticket_items i where i.ticket_id = v_ticket);

  return v_code;
end;
$$;

comment on function public.create_counter_ticket() is
  'Customer: moves the cart''s buyable lines into a new counter ticket (an open one folds in first). Returns the code.';


-- -----------------------------------------------------------------------------
-- 5. rpc('return_counter_ticket'): an open ticket goes back into the cart
-- -----------------------------------------------------------------------------

create or replace function public.return_counter_ticket(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_status text;
begin
  if v_uid is null or public.current_user_role() is distinct from 'customer' then
    raise exception 'Only customer accounts have counter tickets.' using errcode = '42501';
  end if;

  select status into v_status
  from public.counter_tickets
  where id = p_ticket_id and customer_id = v_uid
  for update;

  if not found then
    raise exception 'That ticket doesn''t exist.' using errcode = 'P0002';
  end if;
  if v_status <> 'open' then
    raise exception 'This ticket is already closed.' using errcode = 'P0001', detail = 'closed';
  end if;

  perform private.ticket_back_to_cart(p_ticket_id, 'cancelled');
end;
$$;

comment on function public.return_counter_ticket(uuid) is
  'Customer: puts an open (or expired) ticket''s items back in the cart and cancels it.';

revoke execute on function public.create_counter_ticket() from public, anon;
revoke execute on function public.return_counter_ticket(uuid) from public, anon;
grant execute on function public.create_counter_ticket() to authenticated;
grant execute on function public.return_counter_ticket(uuid) to authenticated;
