-- =============================================================================
-- Name fields (N1): First, Middle, Last, and Suffix instead of one Full name
-- =============================================================================
-- docs/name-plan.md. A person's name is stored in parts:
--
--   profiles      first_name, middle_name, last_name, suffix
--   custom_orders walk_in_first_name, walk_in_middle_name, walk_in_last_name,
--                 walk_in_suffix (a walk-in buyer at the counter)
--
-- The old single columns (profiles.full_name, custom_orders.walk_in_name) stay
-- and are rebuilt from the parts by a trigger as "Juan D. Dela Cruz Jr.", so
-- every screen and SQL function that reads them keeps working unchanged.
--
-- Rules, shared with features/shared/names/model.ts:
--   * Every part is title-cased ("dela cruz" -> "Dela Cruz", "o'brien" ->
--     "O'Brien"), with spaces trimmed and collapsed.
--   * The suffix is one of Jr., Sr., II, III, IV, V.
--   * The combined name shows the middle name as an initial.
--   * Splitting a single name (old rows, or an older client that still writes
--     full_name): a trailing suffix is pulled out, the last word is the last
--     name, the surname particles in front of it (de, dela, del, de los, san,
--     sta., ...) join it, and everything before is the first name. The middle
--     name is left empty.
--
-- An older client that still writes full_name keeps working: the trigger splits
-- what it wrote into the parts. Sign-up reads the parts from the sign-up data,
-- and falls back to full_name the same way.
--
-- Safe to run more than once.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- One name part, tidied: curly apostrophes made straight, spaces trimmed and
-- collapsed, every word title-cased. Empty becomes null.
create or replace function private.clean_name_part(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(initcap(btrim(regexp_replace(replace(coalesce(p, ''), '’', ''''), '\s+', ' ', 'g'))), '')
$$;

-- A suffix written any way ("jr", "JR.", "iii") as it's stored ("Jr.", "III").
-- Anything else comes back trimmed, for the check constraint to refuse.
create or replace function private.clean_name_suffix(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(rtrim(btrim(coalesce(p, '')), '.'))
    when '' then null
    when 'jr' then 'Jr.'
    when 'sr' then 'Sr.'
    when 'ii' then 'II'
    when 'iii' then 'III'
    when 'iv' then 'IV'
    when 'v' then 'V'
    else btrim(p)
  end
$$;

-- Whether a typed name part is acceptable: up to 50 characters of letters
-- (accented ones too), spaces, periods, apostrophes, and hyphens, with at least
-- one letter. Empty counts as fine; whether a part is required is the caller's.
create or replace function private.name_part_ok(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is null or (
    char_length(p) <= 50
    and p ~ '^[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ .''-]+$'
    and p ~ '[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]'
  )
$$;

-- The combined name: "Juan D. Dela Cruz Jr.". Null when there's no first or last name.
create or replace function private.format_person_name(p_first text, p_middle text, p_last text, p_suffix text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p_first, p_last) is null then null else
    concat_ws(' ', p_first, upper(left(p_middle, 1)) || '.', p_last, p_suffix)
  end
$$;

-- One whole name split into first, last, and suffix (see the rules above).
-- Parts come back untidied (the triggers tidy them) and at most 50 characters.
create or replace function private.split_person_name(
  p text,
  out first_name text,
  out last_name text,
  out suffix text
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_words text[];
  v_n     integer;
  v_i     integer;
begin
  v_words := regexp_split_to_array(btrim(regexp_replace(replace(coalesce(p, ''), ',', ' '), '\s+', ' ', 'g')), ' ');
  if v_words = array[''] then
    return;
  end if;
  v_n := array_length(v_words, 1);

  -- "Juan Dela Cruz Jr." -> suffix Jr. (only with two words before it, so "Juan V" keeps its V).
  if v_n >= 3 and lower(rtrim(v_words[v_n], '.')) in ('jr', 'sr', 'ii', 'iii', 'iv', 'v') then
    suffix := private.clean_name_suffix(v_words[v_n]);
    v_n := v_n - 1;
  end if;

  if v_n = 1 then
    first_name := left(v_words[1], 50);
    return;
  end if;

  -- The last word, plus the particles in front of it, always leaving a first name.
  v_i := v_n;
  while v_i > 2 and lower(rtrim(v_words[v_i - 1], '.')) in (
    'de', 'del', 'dela', 'della', 'la', 'las', 'los', 'delos', 'delas',
    'san', 'santa', 'santo', 'sta', 'sto', 'di', 'da', 'dos', 'van', 'von'
  ) loop
    v_i := v_i - 1;
  end loop;

  first_name := left(array_to_string(v_words[1:v_i - 1], ' '), 50);
  last_name := left(array_to_string(v_words[v_i:v_n], ' '), 50);
end;
$$;

revoke execute on function private.clean_name_part(text) from public, anon, authenticated;
revoke execute on function private.clean_name_suffix(text) from public, anon, authenticated;
revoke execute on function private.name_part_ok(text) from public, anon, authenticated;
revoke execute on function private.format_person_name(text, text, text, text) from public, anon, authenticated;
revoke execute on function private.split_person_name(text) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------

alter table public.profiles add column if not exists first_name  text;
alter table public.profiles add column if not exists middle_name text;
alter table public.profiles add column if not exists last_name   text;
alter table public.profiles add column if not exists suffix      text;

alter table public.profiles drop constraint if exists profiles_name_parts_check;
alter table public.profiles add constraint profiles_name_parts_check check (
  coalesce(char_length(first_name), 0) <= 50
  and coalesce(char_length(middle_name), 0) <= 50
  and coalesce(char_length(last_name), 0) <= 50
  and (suffix is null or suffix in ('Jr.', 'Sr.', 'II', 'III', 'IV', 'V'))
);

comment on column public.profiles.first_name is 'Given name(s), title-cased. Required by the app; set at sign-up and on the Account page.';
comment on column public.profiles.middle_name is 'Middle name, title-cased; optional. Shown as an initial in full_name.';
comment on column public.profiles.last_name is 'Surname with its particles ("Dela Cruz"), title-cased. Required by the app.';
comment on column public.profiles.suffix is 'Optional: Jr., Sr., II, III, IV, or V.';
comment on column public.profiles.full_name is 'Built from the name parts by a trigger ("Juan D. Dela Cruz Jr."). Writing it directly (older clients) splits it into the parts.';

create or replace function private.profiles_name_parts()
returns trigger
language plpgsql
security definer -- runs as the signed-in user otherwise, who can't reach the private helpers
set search_path = ''
as $$
declare
  v_split record;
begin
  if tg_op = 'INSERT' then
    if coalesce(new.first_name, new.middle_name, new.last_name, new.suffix) is null then
      select * into v_split from private.split_person_name(new.full_name);
      new.first_name := v_split.first_name;
      new.last_name := v_split.last_name;
      new.suffix := v_split.suffix;
    end if;
  elsif (new.first_name, new.middle_name, new.last_name, new.suffix)
        is not distinct from (old.first_name, old.middle_name, old.last_name, old.suffix) then
    if new.full_name is not distinct from old.full_name then
      return new; -- the name wasn't touched
    end if;
    -- An older client wrote the whole name: split it.
    select * into v_split from private.split_person_name(new.full_name);
    new.first_name := v_split.first_name;
    new.middle_name := null;
    new.last_name := v_split.last_name;
    new.suffix := v_split.suffix;
  end if;

  new.first_name := private.clean_name_part(new.first_name);
  new.middle_name := private.clean_name_part(new.middle_name);
  new.last_name := private.clean_name_part(new.last_name);
  new.suffix := private.clean_name_suffix(new.suffix);
  new.full_name := private.format_person_name(new.first_name, new.middle_name, new.last_name, new.suffix);
  return new;
end;
$$;

revoke execute on function private.profiles_name_parts() from public, anon, authenticated;

drop trigger if exists profiles_name_parts on public.profiles;
create trigger profiles_name_parts
  before insert or update on public.profiles
  for each row execute function private.profiles_name_parts();

-- Existing names, split once (without touching updated_at). Rows that already
-- have parts are left alone, so a second run changes nothing.
alter table public.profiles disable trigger profiles_set_updated_at;
update public.profiles p
set first_name = s.first_name, last_name = s.last_name, suffix = s.suffix
from public.profiles src
cross join lateral private.split_person_name(src.full_name) s
where p.id = src.id
  and p.full_name is not null
  and coalesce(p.first_name, p.middle_name, p.last_name, p.suffix) is null;
update public.profiles set full_name = null where btrim(full_name) = '';
alter table public.profiles enable trigger profiles_set_updated_at;

-- Sign-up: the name parts come in the sign-up data; an older client sends
-- full_name instead, which the trigger splits.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, first_name, middle_name, last_name, suffix, full_name, phone, email, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    left(new.raw_user_meta_data ->> 'first_name', 200),
    left(new.raw_user_meta_data ->> 'middle_name', 200),
    left(new.raw_user_meta_data ->> 'last_name', 200),
    new.raw_user_meta_data ->> 'suffix',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'email',
    'customer'
  );
  return new;
end;
$$;

-- A customer edits their own name parts. full_name stays writable for older clients.
grant update (first_name, middle_name, last_name, suffix) on public.profiles to authenticated;


-- -----------------------------------------------------------------------------
-- custom_orders: the walk-in buyer
-- -----------------------------------------------------------------------------

alter table public.custom_orders add column if not exists walk_in_first_name  text;
alter table public.custom_orders add column if not exists walk_in_middle_name text;
alter table public.custom_orders add column if not exists walk_in_last_name   text;
alter table public.custom_orders add column if not exists walk_in_suffix      text;

alter table public.custom_orders drop constraint if exists custom_orders_walk_in_name_parts_check;
alter table public.custom_orders add constraint custom_orders_walk_in_name_parts_check check (
  coalesce(char_length(walk_in_first_name), 0) <= 50
  and coalesce(char_length(walk_in_middle_name), 0) <= 50
  and coalesce(char_length(walk_in_last_name), 0) <= 50
  and (walk_in_suffix is null or walk_in_suffix in ('Jr.', 'Sr.', 'II', 'III', 'IV', 'V'))
);

comment on column public.custom_orders.walk_in_name is 'A walk-in buyer''s name, built from the walk_in_ name parts by a trigger ("Juan D. Dela Cruz Jr.").';

create or replace function private.custom_orders_walk_in_name()
returns trigger
language plpgsql
security definer -- runs as the signed-in user otherwise, who can't reach the private helpers
set search_path = ''
as $$
declare
  v_split record;
begin
  if tg_op = 'INSERT' then
    if coalesce(new.walk_in_first_name, new.walk_in_middle_name, new.walk_in_last_name, new.walk_in_suffix) is null then
      select * into v_split from private.split_person_name(new.walk_in_name);
      new.walk_in_first_name := v_split.first_name;
      new.walk_in_last_name := v_split.last_name;
      new.walk_in_suffix := v_split.suffix;
    end if;
  elsif (new.walk_in_first_name, new.walk_in_middle_name, new.walk_in_last_name, new.walk_in_suffix)
        is not distinct from (old.walk_in_first_name, old.walk_in_middle_name, old.walk_in_last_name, old.walk_in_suffix) then
    if new.walk_in_name is not distinct from old.walk_in_name then
      return new;
    end if;
    select * into v_split from private.split_person_name(new.walk_in_name);
    new.walk_in_first_name := v_split.first_name;
    new.walk_in_middle_name := null;
    new.walk_in_last_name := v_split.last_name;
    new.walk_in_suffix := v_split.suffix;
  end if;

  new.walk_in_first_name := private.clean_name_part(new.walk_in_first_name);
  new.walk_in_middle_name := private.clean_name_part(new.walk_in_middle_name);
  new.walk_in_last_name := private.clean_name_part(new.walk_in_last_name);
  new.walk_in_suffix := private.clean_name_suffix(new.walk_in_suffix);
  new.walk_in_name := private.format_person_name(new.walk_in_first_name, new.walk_in_middle_name, new.walk_in_last_name, new.walk_in_suffix);
  return new;
end;
$$;

revoke execute on function private.custom_orders_walk_in_name() from public, anon, authenticated;

drop trigger if exists custom_orders_walk_in_name on public.custom_orders;
create trigger custom_orders_walk_in_name
  before insert or update of walk_in_name, walk_in_first_name, walk_in_middle_name, walk_in_last_name, walk_in_suffix
  on public.custom_orders
  for each row execute function private.custom_orders_walk_in_name();

-- Existing walk-in buyers, split once (without touching updated_at).
alter table public.custom_orders disable trigger custom_orders_set_updated_at;
update public.custom_orders o
set walk_in_first_name = s.first_name, walk_in_last_name = s.last_name, walk_in_suffix = s.suffix
from public.custom_orders src
cross join lateral private.split_person_name(src.walk_in_name) s
where o.id = src.id
  and o.walk_in_name is not null
  and coalesce(o.walk_in_first_name, o.walk_in_middle_name, o.walk_in_last_name, o.walk_in_suffix) is null;
alter table public.custom_orders enable trigger custom_orders_set_updated_at;


-- -----------------------------------------------------------------------------
-- create_counter_order: the buyer's name in parts
-- -----------------------------------------------------------------------------
-- Same arguments as before (20261022120000), so callers don't change. p_buyer
-- now takes first_name, middle_name, last_name, and suffix; First and Last are
-- required, and each refusal names its field in DETAIL (order:first_name,
-- order:middle_name, order:last_name, order:suffix). A p_buyer with only the
-- old "name" key still works and is split. Everything else is unchanged.

create or replace function public.create_counter_order(
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
  v_uid     uuid := auth.uid();
  v_order   public.custom_orders;
  v_buyer   jsonb := coalesce(p_buyer, '{}'::jsonb);
  v_first   text := private.clean_name_part(v_buyer ->> 'first_name');
  v_middle  text := private.clean_name_part(v_buyer ->> 'middle_name');
  v_last    text := private.clean_name_part(v_buyer ->> 'last_name');
  v_suffix  text := private.clean_name_suffix(v_buyer ->> 'suffix');
  v_name    text;
  v_split   record;
  v_phone   text := left(btrim(coalesce(v_buyer ->> 'phone', '')), 20);
  v_team    text := nullif(left(btrim(coalesce(p_details ->> 'team', '')), 80), '');
  v_notes   text := nullif(left(btrim(coalesce(p_details ->> 'notes', '')), 2000), '');
  v_needed  date;
  v_part    jsonb;
  v_amount  numeric(12, 2);
  v_paying  numeric(12, 2) := 0;
  v_lines   integer;
  v_found   integer;
  v_pieces  integer;
  v_total   numeric(12, 2);
  v_designs text;
  v_payment public.payments;
begin
  if v_uid is null or not public.is_staff() then
    raise exception 'Only staff can take orders at the counter' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'This order is missing its key; reload the page and try again' using errcode = '22023';
  end if;

  -- Placed already (a retry after a lost reply): hand back that order.
  select * into v_order from public.custom_orders where counter_request_id = p_request_id;
  if found then
    return v_order;
  end if;

  if v_buyer ?| array['first_name', 'middle_name', 'last_name', 'suffix'] then
    if v_first is null then
      raise exception 'Enter the buyer''s first name' using errcode = '22023', detail = 'order:first_name';
    end if;
    if not private.name_part_ok(v_first) then
      raise exception 'Use letters, spaces, periods, apostrophes, or hyphens (up to 50)' using errcode = '22023', detail = 'order:first_name';
    end if;
    if not private.name_part_ok(v_middle) then
      raise exception 'Use letters, spaces, periods, apostrophes, or hyphens (up to 50)' using errcode = '22023', detail = 'order:middle_name';
    end if;
    if v_last is null then
      raise exception 'Enter the buyer''s last name' using errcode = '22023', detail = 'order:last_name';
    end if;
    if not private.name_part_ok(v_last) then
      raise exception 'Use letters, spaces, periods, apostrophes, or hyphens (up to 50)' using errcode = '22023', detail = 'order:last_name';
    end if;
    if v_suffix is not null and v_suffix not in ('Jr.', 'Sr.', 'II', 'III', 'IV', 'V') then
      raise exception 'Pick a suffix from the list' using errcode = '22023', detail = 'order:suffix';
    end if;
  else
    -- An older client: one name, split.
    v_name := left(btrim(regexp_replace(coalesce(v_buyer ->> 'name', ''), '\s+', ' ', 'g')), 80);
    if length(v_name) < 2 then
      raise exception 'Enter the buyer''s name' using errcode = '22023', detail = 'order:name';
    end if;
    select * into v_split from private.split_person_name(v_name);
    v_first := v_split.first_name;
    v_last := v_split.last_name;
    v_suffix := v_split.suffix;
  end if;

  if length(regexp_replace(v_phone, '\D', '', 'g')) not between 7 and 13 then
    raise exception 'Enter the buyer''s phone number' using errcode = '22023', detail = 'order:phone';
  end if;
  if nullif(p_details ->> 'needed_by', '') is not null then
    begin
      v_needed := (p_details ->> 'needed_by')::date;
    exception when others then
      raise exception 'That needed-by date isn''t a date' using errcode = '22023', detail = 'order:needed_by';
    end;
    if v_needed < (now() at time zone 'Asia/Manila')::date then
      raise exception 'The needed-by date has already passed' using errcode = '22023', detail = 'order:needed_by';
    end if;
  end if;

  -- The pieces: one line per design, style and size. Prices come from the catalog, never the request.
  create temp table _wanted (variant_id uuid primary key, quantity integer not null) on commit drop;
  begin
    insert into _wanted (variant_id, quantity)
    select (e ->> 'variant_id')::uuid, sum((e ->> 'quantity')::integer)
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
    group by 1;
  exception when others then
    raise exception 'The order''s pieces don''t look right; reload the page and try again' using errcode = '22023';
  end;
  select count(*), coalesce(sum(quantity), 0) into v_lines, v_pieces from _wanted;
  if v_lines = 0 then
    raise exception 'Add at least one piece' using errcode = '22023', detail = 'order:items';
  end if;
  if exists (select 1 from _wanted where quantity < 1 or quantity > 999) or v_pieces > 5000 then
    raise exception 'Each size takes 1 to 999 pieces' using errcode = '22023', detail = 'order:items';
  end if;

  select count(*), sum(w.quantity * v.price), string_agg(distinct p.name, ', ')
    into v_found, v_total, v_designs
  from _wanted w
  join public.product_variants v on v.id = w.variant_id and v.is_active
  join public.products p on p.id = v.product_id and p.is_active and p.made_to_order;
  if v_found <> v_lines then
    raise exception 'A design, style or size in this order isn''t offered anymore' using errcode = 'P0001', detail = 'order:unavailable';
  end if;

  -- What's paid now, in up to 10 parts with at most one in cash: at least half, at most everything.
  if jsonb_typeof(p_payments) is distinct from 'array' or jsonb_array_length(p_payments) not between 1 and 10
     or (select count(*) from jsonb_array_elements(p_payments) e where e ->> 'method' = 'cash') > 1
     or exists (select 1 from jsonb_array_elements(p_payments) e where coalesce(e ->> 'method', '') not in ('cash', 'e_payment')) then
    raise exception 'Take the payment in cash, by e-payment, or both' using errcode = '22023', detail = 'order:payment';
  end if;
  for v_part in select * from jsonb_array_elements(p_payments) loop
    begin
      v_amount := round((v_part ->> 'amount')::numeric, 2);
    exception when others then
      v_amount := null;
    end;
    if v_amount is null or v_amount <= 0 then
      raise exception 'Each payment needs its amount' using errcode = '22023', detail = 'order:payment';
    end if;
    v_paying := v_paying + v_amount;
  end loop;
  if v_paying < ceil(v_total / 2) then
    raise exception 'The down payment is at least ₱% (half of ₱%)', ceil(v_total / 2), v_total
      using errcode = 'P0001', detail = 'order:down_payment';
  end if;
  if v_paying > v_total then
    raise exception 'That''s more than the ₱% total', v_total using errcode = 'P0001', detail = 'order:over_total';
  end if;

  -- walk_in_name is built from the parts by the custom_orders_walk_in_name trigger.
  insert into public.custom_orders (
    customer_id, walk_in_first_name, walk_in_middle_name, walk_in_last_name, walk_in_suffix,
    walk_in_name, walk_in_phone, team_name, needed_by, notes,
    description, total_price, status, created_via, counter_request_id
  )
  values (
    null, v_first, v_middle, v_last, v_suffix,
    private.format_person_name(v_first, v_middle, v_last, v_suffix), v_phone, v_team, v_needed, v_notes,
    left(v_designs, 500), v_total, 'pending', 'counter', p_request_id
  )
  returning * into v_order;

  insert into public.custom_order_items (order_id, garment, color, size, quantity, product_id, variant_id, unit_price)
  select v_order.id, p.name, v.color, v.size, w.quantity, p.id, v.id, v.price
  from _wanted w
  join public.product_variants v on v.id = w.variant_id
  join public.products p on p.id = v.product_id
  order by p.name, v.color, v.size;

  -- Priced and taken by the cashier, so it's accepted straight away (the history shows both steps).
  update public.custom_orders set status = 'accepted', accepted_by = v_uid where id = v_order.id;

  -- Each part follows the same rules as any payment the shop records: provider, reference,
  -- one transfer per reference. E-payments first, so cash makes up the rest.
  for v_part in
    select e from jsonb_array_elements(p_payments) e order by (e ->> 'method') = 'cash'
  loop
    v_payment := public.record_custom_order_payment(
      v_order.id,
      round((v_part ->> 'amount')::numeric, 2),
      (v_part ->> 'method')::public.payment_method,
      nullif(v_part ->> 'provider', ''),
      nullif(v_part ->> 'reference', ''),
      null,
      'Taken at the counter with the order'
    );
    if nullif(v_part ->> 'scan_id', '') is not null then
      update public.payments set receipt_scan_id = (v_part ->> 'scan_id')::uuid
      where id = v_payment.id
        and exists (select 1 from public.receipt_scans s where s.id = (v_part ->> 'scan_id')::uuid);
    end if;
  end loop;

  select * into v_order from public.custom_orders where id = v_order.id;
  return v_order;
end;
$$;

revoke execute on function public.create_counter_order(jsonb, jsonb, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.create_counter_order(jsonb, jsonb, jsonb, jsonb, uuid) to authenticated;
