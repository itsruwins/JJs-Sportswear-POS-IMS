-- =============================================================================
-- Staff access follows the manuscript
-- =============================================================================
-- The manuscript gives product management (designs, sizes, colors, prices, and
-- stock quantities) to the owner, and gives staff a quick way to check stock by
-- size, design, and quantity. So staff now:
--   * ring up counter sales (rpc create_pos_sale, unchanged)
--   * see today's sales and reprint receipts (reads, unchanged)
--   * look up products and stock (reads, unchanged)
--   * see custom orders without changing them
--   * keep checking and recording custom-order payments (unchanged)
-- and the owner alone:
--   * adds, edits, archives, and photographs products, tags, and variants
--   * changes stock (rpc adjust_stock)
--   * runs custom orders: price, accept, decline, production steps, reprint,
--     back to production, hand over, cancel, and finished photos
--
-- Sales, stock changes, and payments still work for staff: create_pos_sale and
-- the payment functions are security definer and check is_staff() themselves.
-- Customers keep cancelling their own pending orders.
-- Every statement is safe to run again.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- rpc('adjust_stock', ...)   owner only (was staff)
-- -----------------------------------------------------------------------------

create or replace function public.adjust_stock(
  p_variant_id       uuid,
  p_transaction_type public.inventory_transaction_type,
  p_quantity         integer,
  p_reason           text default null,
  p_reference_id     uuid default null
)
returns public.inventory_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_delta integer;
begin
  if v_uid is null or not public.is_owner() then
    raise exception 'Only the owner can adjust stock' using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity = 0 then
    raise exception 'Quantity must not be zero' using errcode = '22023';
  end if;

  case p_transaction_type
    when 'restock', 'return' then
      if p_quantity < 0 then
        raise exception 'Use a positive quantity for %', p_transaction_type using errcode = '22023';
      end if;
      v_delta := p_quantity;
    when 'damage' then
      if p_quantity < 0 then
        raise exception 'Use a positive quantity for damage' using errcode = '22023';
      end if;
      v_delta := -p_quantity;
    when 'adjustment' then
      if p_reason is null or length(trim(p_reason)) = 0 then
        raise exception 'A reason is required for stock adjustments' using errcode = '22023';
      end if;
      v_delta := p_quantity;
    when 'sale' then
      raise exception 'Record sales with create_pos_sale' using errcode = '22023';
  end case;

  return private.apply_stock_change(
    p_variant_id, v_delta, p_transaction_type, p_reason, p_reference_id, v_uid
  );
end;
$$;


-- -----------------------------------------------------------------------------
-- rpc('cancel_custom_order', { p_order_id, p_reason })
-- Customers cancel their own order while it is pending; the owner can cancel
-- any order that is not finished (was staff or owner).
-- -----------------------------------------------------------------------------

create or replace function public.cancel_custom_order(
  p_order_id uuid,
  p_reason   text default null
)
returns public.custom_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner boolean := public.is_owner();
  v_order public.custom_orders;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select * into v_order
  from public.custom_orders
  where id = p_order_id
  for update;

  if not found or (v_order.customer_id <> v_uid and not v_owner) then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if not v_owner and v_order.status <> 'pending' then
    raise exception 'Only pending orders can be cancelled. Please message the shop.'
      using errcode = 'P0001';
  end if;

  perform set_config('app.status_note', coalesce(p_reason, ''), true);

  update public.custom_orders
  set status = 'cancelled'
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;


-- -----------------------------------------------------------------------------
-- rpc('set_production_step', { p_order_id, p_step, p_done })   owner only (was staff)
--   Same as 20261009120000_custom_order_production_fixes.sql apart from the check.
-- -----------------------------------------------------------------------------

create or replace function public.set_production_step(
  p_order_id uuid,
  p_step     public.production_step,
  p_done     boolean
)
returns public.custom_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_order public.custom_orders;
  v_label text := case p_step
    when 'printing' then 'Printing'
    when 'cutting' then 'Cutting'
    when 'sewing' then 'Sewing'
    when 'inspection' then 'Inspection'
    else 'Folding and packing'
  end;
  v_changed boolean := false;
begin
  if v_uid is null or not public.is_owner() then
    raise exception 'Only the owner can update production' using errcode = '42501';
  end if;

  select * into v_order from public.custom_orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.status not in ('accepted', 'in_progress') then
    raise exception 'Production steps can only change while order % is accepted or in production', v_order.order_number
      using errcode = 'P0001';
  end if;

  -- Steps go in order: a step needs the one before it, and undoing waits for the ones after it.
  if p_done and p_step <> 'printing' and not exists (
    select 1 from public.custom_order_steps
    where order_id = p_order_id
      and step = (select s from unnest(enum_range(null::public.production_step)) s where s < p_step order by s desc limit 1)
  ) then
    raise exception 'Finish the step before % first', v_label using errcode = 'P0001';
  end if;
  if not p_done and exists (
    select 1 from public.custom_order_steps where order_id = p_order_id and step > p_step
  ) then
    raise exception 'Undo the later steps before %', v_label using errcode = 'P0001';
  end if;

  if p_done then
    if v_order.status = 'accepted' then
      update public.custom_orders set status = 'in_progress' where id = p_order_id returning * into v_order;
    end if;
    insert into public.custom_order_steps (order_id, step, done_by)
    values (p_order_id, p_step, v_uid)
    on conflict (order_id, step) do nothing;
    v_changed := found;
  else
    delete from public.custom_order_steps where order_id = p_order_id and step = p_step;
    v_changed := found;
  end if;

  if v_changed then
    -- clock_timestamp(): after the status row a first tick writes in this same transaction.
    insert into public.order_status_history (order_id, status, note, changed_by, created_at)
    values (p_order_id, v_order.status, v_label || case when p_done then ' done' else ' marked not done' end, v_uid, clock_timestamp());
  end if;

  return v_order;
end;
$$;


-- -----------------------------------------------------------------------------
-- rpc('reprint_custom_order', { p_order_id, p_reason })   owner only (was staff)
-- -----------------------------------------------------------------------------

create or replace function public.reprint_custom_order(
  p_order_id uuid,
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
    raise exception 'Only the owner can update production' using errcode = '42501';
  end if;
  if length(v_reason) < 3 then
    raise exception 'Say what failed inspection' using errcode = '22023';
  end if;

  select * into v_order from public.custom_orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.status <> 'in_progress' then
    raise exception 'Only an order in production can be sent back for a reprint' using errcode = 'P0001';
  end if;

  delete from public.custom_order_steps
  where order_id = p_order_id;

  insert into public.order_status_history (order_id, status, note, changed_by, created_at)
  values (p_order_id, 'in_progress', 'Failed inspection, reprinting: ' || v_reason, v_uid, clock_timestamp());

  return v_order;
end;
$$;


-- -----------------------------------------------------------------------------
-- rpc('reopen_custom_order', { p_order_id, p_reason })   owner only (was staff)
-- -----------------------------------------------------------------------------

create or replace function public.reopen_custom_order(
  p_order_id uuid,
  p_reason   text
)
returns public.custom_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order  public.custom_orders;
  v_reason text := left(btrim(coalesce(p_reason, '')), 300);
begin
  if auth.uid() is null or not public.is_owner() then
    raise exception 'Only the owner can update production' using errcode = '42501';
  end if;
  if length(v_reason) < 3 then
    raise exception 'Say what needs fixing' using errcode = '22023';
  end if;

  select * into v_order from public.custom_orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.status <> 'ready' then
    raise exception 'Order % can''t go from % to in_progress', v_order.order_number, v_order.status using errcode = 'P0001';
  end if;

  -- The status trigger writes this note into the history row.
  perform set_config('app.status_note', 'Back to production: ' || v_reason, true);
  update public.custom_orders set status = 'in_progress' where id = p_order_id returning * into v_order;
  return v_order;
end;
$$;


-- -----------------------------------------------------------------------------
-- Catalog: everyone signed in to the admin reads it; only the owner writes it.
-- -----------------------------------------------------------------------------

drop policy if exists "products: staff insert" on public.products;
drop policy if exists "products: owner insert" on public.products;
create policy "products: owner insert"
  on public.products for insert to authenticated
  with check ((select public.is_owner()) and created_by = (select auth.uid()));

drop policy if exists "products: staff update" on public.products;
drop policy if exists "products: owner update" on public.products;
create policy "products: owner update"
  on public.products for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));


drop policy if exists "product_images: staff insert" on public.product_images;
drop policy if exists "product_images: owner insert" on public.product_images;
create policy "product_images: owner insert"
  on public.product_images for insert to authenticated
  with check ((select public.is_owner()));

drop policy if exists "product_images: staff update" on public.product_images;
drop policy if exists "product_images: owner update" on public.product_images;
create policy "product_images: owner update"
  on public.product_images for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

drop policy if exists "product_images: staff delete" on public.product_images;
drop policy if exists "product_images: owner delete" on public.product_images;
create policy "product_images: owner delete"
  on public.product_images for delete to authenticated
  using ((select public.is_owner()));


drop policy if exists "product_tags: staff insert" on public.product_tags;
drop policy if exists "product_tags: owner insert" on public.product_tags;
create policy "product_tags: owner insert"
  on public.product_tags for insert to authenticated
  with check ((select public.is_owner()));

drop policy if exists "product_tags: staff update" on public.product_tags;
drop policy if exists "product_tags: owner update" on public.product_tags;
create policy "product_tags: owner update"
  on public.product_tags for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

drop policy if exists "product_tags: staff delete" on public.product_tags;
drop policy if exists "product_tags: owner delete" on public.product_tags;
create policy "product_tags: owner delete"
  on public.product_tags for delete to authenticated
  using ((select public.is_owner()));


drop policy if exists "product_variants: staff insert" on public.product_variants;
drop policy if exists "product_variants: owner insert" on public.product_variants;
create policy "product_variants: owner insert"
  on public.product_variants for insert to authenticated
  with check ((select public.is_owner()));

drop policy if exists "product_variants: staff update" on public.product_variants;
drop policy if exists "product_variants: owner update" on public.product_variants;
create policy "product_variants: owner update"
  on public.product_variants for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));


-- -----------------------------------------------------------------------------
-- Custom orders: staff read them; the owner changes them.
-- -----------------------------------------------------------------------------

drop policy if exists "custom_orders: staff update" on public.custom_orders;
drop policy if exists "custom_orders: owner update" on public.custom_orders;
create policy "custom_orders: owner update"
  on public.custom_orders for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));


drop policy if exists "custom_order_items: insert own pending or staff" on public.custom_order_items;
drop policy if exists "custom_order_items: insert own pending or owner" on public.custom_order_items;
create policy "custom_order_items: insert own pending or owner"
  on public.custom_order_items for insert to authenticated
  with check (
    (select public.is_owner())
    or exists (
      select 1 from public.custom_orders o
      where o.id = order_id and o.customer_id = (select auth.uid()) and o.status = 'pending'
    )
  );

drop policy if exists "custom_order_items: update own pending or staff" on public.custom_order_items;
drop policy if exists "custom_order_items: update own pending or owner" on public.custom_order_items;
create policy "custom_order_items: update own pending or owner"
  on public.custom_order_items for update to authenticated
  using (
    (select public.is_owner())
    or exists (
      select 1 from public.custom_orders o
      where o.id = order_id and o.customer_id = (select auth.uid()) and o.status = 'pending'
    )
  )
  with check (
    (select public.is_owner())
    or exists (
      select 1 from public.custom_orders o
      where o.id = order_id and o.customer_id = (select auth.uid()) and o.status = 'pending'
    )
  );

drop policy if exists "custom_order_items: delete own pending or staff" on public.custom_order_items;
drop policy if exists "custom_order_items: delete own pending or owner" on public.custom_order_items;
create policy "custom_order_items: delete own pending or owner"
  on public.custom_order_items for delete to authenticated
  using (
    (select public.is_owner())
    or exists (
      select 1 from public.custom_orders o
      where o.id = order_id and o.customer_id = (select auth.uid()) and o.status = 'pending'
    )
  );


drop policy if exists "custom_order_photos: staff insert" on public.custom_order_photos;
drop policy if exists "custom_order_photos: owner insert" on public.custom_order_photos;
create policy "custom_order_photos: owner insert"
  on public.custom_order_photos for insert to authenticated
  with check ((select public.is_owner()) and created_by = (select auth.uid()));

drop policy if exists "custom_order_photos: staff delete" on public.custom_order_photos;
drop policy if exists "custom_order_photos: owner delete" on public.custom_order_photos;
create policy "custom_order_photos: owner delete"
  on public.custom_order_photos for delete to authenticated
  using ((select public.is_owner()));


-- -----------------------------------------------------------------------------
-- Storage: product photos and finished-order photos are uploaded by the owner.
-- (payment-proofs stays with staff: they record payments.)
-- -----------------------------------------------------------------------------

drop policy if exists "product-images: staff upload" on storage.objects;
drop policy if exists "product-images: owner upload" on storage.objects;
create policy "product-images: owner upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.is_owner()));

drop policy if exists "product-images: staff update" on storage.objects;
drop policy if exists "product-images: owner update" on storage.objects;
create policy "product-images: owner update"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select public.is_owner()))
  with check (bucket_id = 'product-images' and (select public.is_owner()));

drop policy if exists "product-images: staff delete" on storage.objects;
drop policy if exists "product-images: owner delete" on storage.objects;
create policy "product-images: owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select public.is_owner()));


drop policy if exists "order-photos: staff upload" on storage.objects;
drop policy if exists "order-photos: owner upload" on storage.objects;
create policy "order-photos: owner upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'order-photos' and (select public.is_owner()));

drop policy if exists "order-photos: staff update" on storage.objects;
drop policy if exists "order-photos: owner update" on storage.objects;
create policy "order-photos: owner update"
  on storage.objects for update to authenticated
  using (bucket_id = 'order-photos' and (select public.is_owner()))
  with check (bucket_id = 'order-photos' and (select public.is_owner()));

drop policy if exists "order-photos: staff delete" on storage.objects;
drop policy if exists "order-photos: owner delete" on storage.objects;
create policy "order-photos: owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'order-photos' and (select public.is_owner()));
