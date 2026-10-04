-- =============================================================================
-- Custom orders: production steps, finished photos, and real status transitions
-- =============================================================================
-- 1. Production steps. While an order is in production, staff tick off the shop's
--    steps: printing, cutting, sewing, inspection, folding and packing. Steps
--    change only through rpc(set_production_step) and rpc(reprint_custom_order),
--    and each change is written to the order's status history. Steps go in order
--    (each needs the one before it). A failed inspection sends the order back to
--    printing (reprint).
-- 2. Finished photos. Up to 4 per order, stored in the private order-photos
--    bucket at {order_id}/...; staff add and remove them, and the order's
--    customer can see them.
-- 3. Status transitions. Only these moves are allowed:
--      pending -> accepted | declined | cancelled
--      accepted -> in_progress | cancelled
--      in_progress -> ready | cancelled      (ready needs every step done)
--      ready -> completed | in_progress | cancelled
--    Declined, completed, and cancelled orders stay as they are.
-- Safe to run more than once.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'production_step' and typnamespace = 'public'::regnamespace) then
    create type public.production_step as enum ('printing', 'cutting', 'sewing', 'inspection', 'packing');
  end if;
end;
$$;

create table if not exists public.custom_order_steps (
  order_id  uuid not null references public.custom_orders (id) on delete cascade,
  step      public.production_step not null,
  done_at   timestamptz not null default now(),
  done_by   uuid not null references public.profiles (id) on delete restrict,
  primary key (order_id, step)
);

comment on table public.custom_order_steps is 'Production steps finished for a custom order. Changed only through rpc(set_production_step) and rpc(reprint_custom_order).';

create table if not exists public.custom_order_photos (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.custom_orders (id) on delete cascade,
  path        text not null,
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now(),
  constraint custom_order_photos_path_key unique (order_id, path),
  constraint custom_order_photos_path_in_folder check (path like order_id::text || '/%')
);

comment on table public.custom_order_photos is 'Photos of a finished custom order (up to 4), stored in the private order-photos bucket.';

create index if not exists custom_order_photos_order_id_idx on public.custom_order_photos (order_id, created_at);


-- At most four photos per order.
create or replace function private.custom_order_photos_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.custom_orders where id = new.order_id for update;
  if (select count(*) from public.custom_order_photos where order_id = new.order_id) >= 4 then
    raise exception 'An order can have up to 4 finished photos' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists custom_order_photos_limit on public.custom_order_photos;
create trigger custom_order_photos_limit
  before insert on public.custom_order_photos
  for each row execute function private.custom_order_photos_limit();


-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------

alter table public.custom_order_steps enable row level security;
alter table public.custom_order_photos enable row level security;

drop policy if exists "custom_order_steps: read own or staff" on public.custom_order_steps;
create policy "custom_order_steps: read own or staff"
  on public.custom_order_steps for select to authenticated
  using (
    (select public.is_staff())
    or exists (select 1 from public.custom_orders o where o.id = order_id and o.customer_id = (select auth.uid()))
  );

drop policy if exists "custom_order_photos: read own or staff" on public.custom_order_photos;
create policy "custom_order_photos: read own or staff"
  on public.custom_order_photos for select to authenticated
  using (
    (select public.is_staff())
    or exists (select 1 from public.custom_orders o where o.id = order_id and o.customer_id = (select auth.uid()))
  );

drop policy if exists "custom_order_photos: staff insert" on public.custom_order_photos;
create policy "custom_order_photos: staff insert"
  on public.custom_order_photos for insert to authenticated
  with check ((select public.is_staff()) and created_by = (select auth.uid()));

drop policy if exists "custom_order_photos: staff delete" on public.custom_order_photos;
create policy "custom_order_photos: staff delete"
  on public.custom_order_photos for delete to authenticated
  using ((select public.is_staff()));

revoke insert, update, delete on public.custom_order_steps from anon, authenticated;
revoke update on public.custom_order_photos from anon, authenticated;
grant select on public.custom_order_steps to authenticated;
grant select, insert, delete on public.custom_order_photos to authenticated;


-- -----------------------------------------------------------------------------
-- Status transitions (replaces the Phase 1 version: same timestamps and price
-- rule, plus the allowed moves and "every step done before ready")
-- -----------------------------------------------------------------------------

create or replace function private.custom_order_before_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if old.status in ('declined', 'completed', 'cancelled') then
    raise exception 'Order % is already % and its status can no longer change',
      old.order_number, old.status using errcode = 'P0001';
  end if;
  if not (
       (old.status = 'pending'     and new.status in ('accepted', 'declined', 'cancelled'))
    or (old.status = 'accepted'    and new.status in ('in_progress', 'cancelled'))
    or (old.status = 'in_progress' and new.status in ('ready', 'cancelled'))
    or (old.status = 'ready'       and new.status in ('completed', 'in_progress', 'cancelled'))
  ) then
    raise exception 'Order % can''t go from % to %', old.order_number, old.status, new.status
      using errcode = 'P0001';
  end if;

  case new.status
    when 'accepted' then
      if new.total_price is null then
        raise exception 'Set the total price before accepting order %', new.order_number
          using errcode = 'P0001';
      end if;
      new.accepted_at := coalesce(new.accepted_at, now());
      new.accepted_by := coalesce(new.accepted_by, auth.uid());
    when 'ready' then
      if (select count(*) from public.custom_order_steps where order_id = new.id) < 5 then
        raise exception 'Finish every production step before marking order % ready', new.order_number
          using errcode = 'P0001';
      end if;
      new.ready_at := now();
    when 'completed' then
      new.completed_at := coalesce(new.completed_at, now());
    else
      null;
  end case;
  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- rpc('set_production_step', { p_order_id, p_step, p_done })   staff only
--   Ticks a step on or off. The first tick on an accepted order starts production.
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
  if v_uid is null or not public.is_staff() then
    raise exception 'Only staff can update production' using errcode = '42501';
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
-- rpc('reprint_custom_order', { p_order_id, p_reason })   staff only
--   A failed inspection: production starts over from printing (every step clears).
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
  if v_uid is null or not public.is_staff() then
    raise exception 'Only staff can update production' using errcode = '42501';
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
-- rpc('reopen_custom_order', { p_order_id, p_reason })   staff only
--   A ready order goes back to production, with the reason in its history.
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
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Only staff can update production' using errcode = '42501';
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
-- Customer notifications on status changes (replaces the Phase 1 version: the
-- same messages, plus a gentler one when a ready order goes back to production)
-- -----------------------------------------------------------------------------

create or replace function private.handle_custom_order_status_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := coalesce(auth.uid(), new.accepted_by, new.customer_id);
  v_note   text := coalesce(
    nullif(current_setting('app.status_note', true), ''),
    case when new.status = 'declined' then new.decline_reason end
  );
  v_reopen boolean := old.status = 'ready' and new.status = 'in_progress';
begin
  if new.status is not distinct from old.status then
    return null;
  end if;

  insert into public.order_status_history (order_id, status, note, changed_by)
  values (new.id, new.status, v_note, v_actor);

  if v_actor = new.customer_id then
    -- Customer changed their own order (cancellation): tell the shop.
    perform private.notify_staff(
      'Order ' || replace(new.status::text, '_', ' '),
      format('Order %s was %s by the customer.', new.order_number, replace(new.status::text, '_', ' ')),
      'order_status',
      new.id
    );
  else
    insert into public.notifications (user_id, title, message, type, reference_id)
    values (
      new.customer_id,
      case
        when v_reopen then 'Order needs a little more work'
        when new.status = 'accepted'    then 'Order accepted'
        when new.status = 'declined'    then 'Order declined'
        when new.status = 'in_progress' then 'Order in production'
        when new.status = 'ready'       then 'Order ready for pickup'
        when new.status = 'completed'   then 'Order completed'
        when new.status = 'cancelled'   then 'Order cancelled'
        else 'Order updated'
      end,
      case
        when v_reopen then format('Your order %s needs a little more work before pickup. We''ll tell you when it''s ready again.', new.order_number)
        when new.status = 'accepted'    then format('Your order %s was accepted. Total: ₱%s.', new.order_number, new.total_price)
        when new.status = 'declined'    then format('Your order %s was declined: %s', new.order_number, new.decline_reason)
        when new.status = 'in_progress' then format('Your order %s is now being made.', new.order_number)
        when new.status = 'ready'       then format('Your order %s is ready for pickup.', new.order_number)
        when new.status = 'completed'   then format('Your order %s is complete. Thank you!', new.order_number)
        when new.status = 'cancelled'   then format('Your order %s was cancelled.%s', new.order_number, coalesce(' ' || v_note, ''))
        else format('Your order %s is now %s.', new.order_number, new.status)
      end,
      'order_status',
      new.id
    );
  end if;

  return null;
end;
$$;


-- Foreign keys to profiles get an index, like changed_by.
create index if not exists custom_order_steps_done_by_idx on public.custom_order_steps (done_by);
create index if not exists custom_order_photos_created_by_idx on public.custom_order_photos (created_by);


-- -----------------------------------------------------------------------------
-- Live updates: the order screens refresh the moment an order, step, photo, or
-- history entry changes (postgres_changes still respects each table's RLS).
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['custom_orders', 'custom_order_steps', 'custom_order_photos', 'order_status_history'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

revoke execute on function public.set_production_step(uuid, public.production_step, boolean) from public, anon;
revoke execute on function public.reprint_custom_order(uuid, text) from public, anon;
grant execute on function public.set_production_step(uuid, public.production_step, boolean) to authenticated;
grant execute on function public.reprint_custom_order(uuid, text) to authenticated;
revoke execute on function public.reopen_custom_order(uuid, text) from public, anon;
grant execute on function public.reopen_custom_order(uuid, text) to authenticated;
