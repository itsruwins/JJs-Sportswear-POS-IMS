-- =============================================================================
-- Customer cart (Phase T1 of docs/ticket-plan.md)
-- =============================================================================
-- A customer's cart is saved to their account, so it follows them to another
-- device:
--   * cart_items: one row per customer per variant, with its quantity;
--   * customers read and delete only their own lines (RLS);
--   * every add or change goes through rpc('cart_set'), which checks the item
--     is still sold ready-made and caps the quantity at the stock on hand.
-- Stock is not held: the counter checks it again when the order is rung up.
-- Every statement is safe to run again.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Cart lines
-- -----------------------------------------------------------------------------

create table if not exists public.cart_items (
  customer_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  variant_id   uuid not null references public.product_variants (id) on delete cascade,
  quantity     integer not null check (quantity between 1 and 99),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (customer_id, variant_id)
);

comment on table public.cart_items is 'A customer''s cart: ready-made variants to buy at the counter. Written through rpc(cart_set).';
comment on column public.cart_items.quantity is 'Pieces wanted, 1 to 99, capped at the stock on hand when it was set.';

create index if not exists cart_items_variant_id_idx on public.cart_items (variant_id);

drop trigger if exists cart_items_set_updated_at on public.cart_items;
create trigger cart_items_set_updated_at
  before update on public.cart_items
  for each row execute function private.set_updated_at();


-- -----------------------------------------------------------------------------
-- 2. Access: read and remove your own lines; adds and changes go through cart_set
-- -----------------------------------------------------------------------------

alter table public.cart_items enable row level security;

revoke all on public.cart_items from anon;
revoke insert, update on public.cart_items from authenticated;
grant select, delete on public.cart_items to authenticated;

drop policy if exists "cart_items: read own" on public.cart_items;
create policy "cart_items: read own"
  on public.cart_items for select to authenticated
  using (customer_id = (select auth.uid()));

drop policy if exists "cart_items: delete own" on public.cart_items;
create policy "cart_items: delete own"
  on public.cart_items for delete to authenticated
  using (customer_id = (select auth.uid()));


-- -----------------------------------------------------------------------------
-- 3. rpc('cart_set'): add to a line, or set it (0 removes it)
-- -----------------------------------------------------------------------------
-- p_add true adds p_quantity to what's already in the cart; false sets it.
-- Returns the line's quantity afterwards (0 when removed). A quantity above the
-- stock on hand is lowered to it. Refusals carry DETAIL for the app:
--   'sold_out', 'unavailable', 'full'.

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

  select v.stock_quantity, (v.is_active and p.is_active and not p.made_to_order)
  into v_stock, v_sellable
  from public.product_variants v
  join public.products p on p.id = v.product_id
  where v.id = p_variant_id;

  if not found or not v_sellable then
    raise exception 'This item isn''t sold ready-made anymore.' using errcode = 'P0001', detail = 'unavailable';
  end if;
  if v_stock <= 0 then
    raise exception 'This size just sold out.' using errcode = 'P0001', detail = 'sold_out';
  end if;

  if v_current is null and (select count(*) from public.cart_items where customer_id = v_uid) >= 50 then
    raise exception 'Your cart holds up to 50 different items.' using errcode = 'P0001', detail = 'full';
  end if;

  v_want := least(v_want, v_stock, 99);

  insert into public.cart_items (customer_id, variant_id, quantity)
  values (v_uid, p_variant_id, v_want)
  on conflict (customer_id, variant_id) do update set quantity = excluded.quantity;

  return v_want;
end;
$$;

comment on function public.cart_set(uuid, integer, boolean) is
  'Customer cart: add to (p_add) or set a line; 0 removes. Caps at stock on hand; refuses sold-out and non-ready-made items.';

revoke execute on function public.cart_set(uuid, integer, boolean) from public, anon;
grant execute on function public.cart_set(uuid, integer, boolean) to authenticated;
