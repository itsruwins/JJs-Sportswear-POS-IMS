-- =============================================================================
-- Customer custom-order requests (customer Phase C3)
-- =============================================================================
-- Customers send custom-order requests from the shop app:
--   * three new request fields: a team or organization name, a needed-by date,
--     and up to three reference images (logos, sample pictures);
--   * a private order-references bucket for those images, one folder per customer;
--   * rpc('submit_custom_order') and rpc('update_custom_order'), which save an
--     order and all of its garments in one transaction, so a request is never
--     half saved. A customer can edit a request until the shop accepts it, and
--     cancels through the existing rpc('cancel_custom_order').
-- Every statement is safe to run again.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Request fields
-- -----------------------------------------------------------------------------

alter table public.custom_orders add column if not exists team_name text;
alter table public.custom_orders add column if not exists needed_by date;
alter table public.custom_orders add column if not exists reference_images text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'custom_orders_team_name_length') then
    alter table public.custom_orders
      add constraint custom_orders_team_name_length check (team_name is null or char_length(team_name) <= 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'custom_orders_reference_images_max') then
    alter table public.custom_orders
      add constraint custom_orders_reference_images_max check (coalesce(array_length(reference_images, 1), 0) <= 3);
  end if;
end;
$$;

comment on column public.custom_orders.team_name is 'Team or organization the order is for, as the customer wrote it.';
comment on column public.custom_orders.needed_by is 'When the customer needs the order (e.g. tournament day). Optional.';
comment on column public.custom_orders.reference_images is 'Up to 3 paths in the private order-references bucket ({customer_id}/...).';

-- Writes to custom_orders are granted column by column (initial schema), so these
-- new columns can only be set through the request functions below.


-- -----------------------------------------------------------------------------
-- 2. Reference images: order-references/{customer_id}/{file}
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-references', 'order-references', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "order-references: read own or staff" on storage.objects;
create policy "order-references: read own or staff"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'order-references'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_staff()))
  );

drop policy if exists "order-references: upload own" on storage.objects;
create policy "order-references: upload own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'order-references'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- A customer may remove their own images, except ones an order the shop has
-- already accepted (or closed) still points at.
drop policy if exists "order-references: delete own" on storage.objects;
create policy "order-references: delete own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'order-references'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.custom_orders o
      where o.customer_id = (select auth.uid())
        and o.status <> 'pending'
        and storage.objects.name = any (o.reference_images)
    )
  );


-- -----------------------------------------------------------------------------
-- 3. Checking and saving a request
-- -----------------------------------------------------------------------------
-- p_items is a JSON array of garments, one entry per size:
--   [{ "garment": "Reversible jersey", "color": "Royal", "size": "M", "quantity": 5,
--      "notes": "Names and numbers: ..." }, ...]

create or replace function private.check_order_request(
  p_uid              uuid,
  p_description      text,
  p_items            jsonb,
  p_team_name        text,
  p_needed_by        date,
  p_notes            text,
  p_reference_images text[],
  p_ai_design_id     uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item   jsonb;
  v_qty    integer;
  v_total  integer := 0;
  v_path   text;
begin
  if char_length(coalesce(trim(p_description), '')) < 3 then
    raise exception 'Say what the order is for in a few words.' using errcode = '22023';
  end if;
  if char_length(trim(p_description)) > 500 then
    raise exception 'Keep the order description under 500 characters.' using errcode = '22023';
  end if;
  if char_length(coalesce(trim(p_team_name), '')) > 80 then
    raise exception 'Keep the team name under 80 characters.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_notes, '')) > 1000 then
    raise exception 'Keep the notes under 1,000 characters.' using errcode = '22023';
  end if;
  if p_needed_by is not null and p_needed_by < (now() at time zone 'Asia/Manila')::date then
    raise exception 'The needed-by date has already passed.' using errcode = '22023';
  end if;

  if coalesce(array_length(p_reference_images, 1), 0) > 3 then
    raise exception 'Attach up to 3 reference images.' using errcode = '22023';
  end if;
  foreach v_path in array coalesce(p_reference_images, '{}') loop
    if v_path not like p_uid::text || '/%' or v_path like '%..%' then
      raise exception 'A reference image is not one of your uploads.' using errcode = '42501';
    end if;
  end loop;

  if p_ai_design_id is not null and not exists (
    select 1 from public.ai_designs d where d.id = p_ai_design_id and d.customer_id = p_uid
  ) then
    raise exception 'That design is not one of yours.' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one garment with a quantity.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 80 then
    raise exception 'That is too many lines for one order. Split it into two requests.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if char_length(coalesce(trim(v_item ->> 'garment'), '')) not between 1 and 60 then
      raise exception 'Every garment needs a name (up to 60 characters).' using errcode = '22023';
    end if;
    if char_length(coalesce(v_item ->> 'color', '')) > 40 then
      raise exception 'Keep each color under 40 characters.' using errcode = '22023';
    end if;
    if char_length(coalesce(trim(v_item ->> 'size'), '')) not between 1 and 20 then
      raise exception 'Every line needs a size.' using errcode = '22023';
    end if;
    if char_length(coalesce(v_item ->> 'notes', '')) > 1000 then
      raise exception 'Keep each garment''s notes under 1,000 characters.' using errcode = '22023';
    end if;
    begin
      v_qty := (v_item ->> 'quantity')::integer;
    exception when others then
      raise exception 'Quantities must be whole numbers.' using errcode = '22023';
    end;
    if v_qty is null or v_qty not between 1 and 999 then
      raise exception 'Each size takes 1 to 999 pieces.' using errcode = '22023';
    end if;
    v_total := v_total + v_qty;
  end loop;

  if v_total > 5000 then
    raise exception 'That is more than 5,000 pieces. Message the shop for orders that size.' using errcode = '22023';
  end if;
end;
$$;

-- Lines keep the order they were sent in (the admin lists items by created_at).
create or replace function private.write_order_items(p_order_id uuid, p_items jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.custom_order_items (order_id, garment, color, size, quantity, notes, created_at)
  select p_order_id,
         trim(x.value ->> 'garment'),
         nullif(trim(x.value ->> 'color'), ''),
         trim(x.value ->> 'size'),
         (x.value ->> 'quantity')::integer,
         nullif(trim(x.value ->> 'notes'), ''),
         now() + make_interval(secs => x.ordinality / 1000000.0)
  from jsonb_array_elements(p_items) with ordinality as x(value, ordinality);
$$;

revoke all on function private.check_order_request(uuid, text, jsonb, text, date, text, text[], uuid) from public;
revoke all on function private.write_order_items(uuid, jsonb) from public;


-- rpc('submit_custom_order', { p_description, p_items, p_team_name, p_needed_by,
--                              p_notes, p_reference_images, p_ai_design_id })
create or replace function public.submit_custom_order(
  p_description      text,
  p_items            jsonb,
  p_team_name        text default null,
  p_needed_by        date default null,
  p_notes            text default null,
  p_reference_images text[] default '{}',
  p_ai_design_id     uuid default null
)
returns public.custom_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_order public.custom_orders;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and role = 'customer') then
    raise exception 'Only customer accounts can send custom orders.' using errcode = '42501';
  end if;

  perform private.check_order_request(
    v_uid, p_description, p_items, p_team_name, p_needed_by, p_notes, p_reference_images, p_ai_design_id
  );

  insert into public.custom_orders (customer_id, description, notes, team_name, needed_by, reference_images, ai_design_id)
  values (
    v_uid,
    trim(p_description),
    nullif(trim(p_notes), ''),
    nullif(trim(p_team_name), ''),
    p_needed_by,
    coalesce(p_reference_images, '{}'),
    p_ai_design_id
  )
  returning * into v_order;

  perform private.write_order_items(v_order.id, p_items);
  return v_order;
end;
$$;


-- rpc('update_custom_order', { p_order_id, ...same as submit })
-- Replaces the request's details and garments while the shop hasn't accepted it.
create or replace function public.update_custom_order(
  p_order_id         uuid,
  p_description      text,
  p_items            jsonb,
  p_team_name        text default null,
  p_needed_by        date default null,
  p_notes            text default null,
  p_reference_images text[] default '{}',
  p_ai_design_id     uuid default null
)
returns public.custom_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_order public.custom_orders;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select * into v_order from public.custom_orders where id = p_order_id for update;
  if not found or v_order.customer_id <> v_uid then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.status <> 'pending' then
    raise exception 'The shop has already reviewed this order, so it can''t be edited. Message the shop to change it.'
      using errcode = 'P0001';
  end if;

  perform private.check_order_request(
    v_uid, p_description, p_items, p_team_name, p_needed_by, p_notes, p_reference_images, p_ai_design_id
  );

  update public.custom_orders
  set description      = trim(p_description),
      notes            = nullif(trim(p_notes), ''),
      team_name        = nullif(trim(p_team_name), ''),
      needed_by        = p_needed_by,
      reference_images = coalesce(p_reference_images, '{}'),
      ai_design_id     = p_ai_design_id
  where id = p_order_id
  returning * into v_order;

  delete from public.custom_order_items where order_id = p_order_id;
  perform private.write_order_items(p_order_id, p_items);
  return v_order;
end;
$$;

revoke execute on function public.submit_custom_order(text, jsonb, text, date, text, text[], uuid) from public, anon;
revoke execute on function public.update_custom_order(uuid, text, jsonb, text, date, text, text[], uuid) from public, anon;
grant execute on function public.submit_custom_order(text, jsonb, text, date, text, text[], uuid) to authenticated;
grant execute on function public.update_custom_order(uuid, text, jsonb, text, date, text, text[], uuid) to authenticated;
