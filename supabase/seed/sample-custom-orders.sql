-- =============================================================================
-- J&J Sportswear: SAMPLE custom orders (demo data only)
-- =============================================================================
-- Run once in the Supabase SQL editor, after the owner account exists and after
-- supabase/migrations/20261009000000_custom_order_production.sql.
-- Creates four sample customer accounts (marked sample in their account metadata;
-- they can't log in: their passwords are random) and nine custom orders across every
-- status, each with items and a status history. Remove everything with
-- supabase/seed/remove-sample-custom-orders.sql. Names, teams, quantities, and
-- prices are illustrative, not the shop's real data.
-- =============================================================================

begin;

do $$
begin
  if not exists (select 1 from public.profiles where role = 'owner') then
    raise exception 'No owner account yet. Sign up and promote the owner first.';
  end if;
  if exists (select 1 from auth.users where raw_app_meta_data ->> 'sample' = 'true') then
    raise exception 'Sample orders are already loaded. Run remove-sample-custom-orders.sql first to reload them.';
  end if;
  if to_regclass('public.custom_order_steps') is null then
    raise exception 'Run supabase/migrations/20261009000000_custom_order_production.sql first.';
  end if;
end;
$$;

-- Sample customers (the sign-up trigger creates their profiles).
create temp table _cust (username text primary key, id uuid not null default gen_random_uuid(), full_name text, phone text) on commit drop;
insert into _cust (username, full_name, phone) values
  ('sample.coachmarco', 'Marco Llorin (sample)', '0917 555 0101'),
  ('sample.mara',       'Mara Belgica (sample)', '0927 555 0163'),
  ('sample.teachjen',   'Jen Rañola (sample)',   '0908 555 0144'),
  ('sample.paolo',      'Paolo Mirandilla (sample)', null);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', c.id, 'authenticated', 'authenticated',
  c.username || '@jjsportswear.local',
  extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"],"sample":true}'::jsonb,
  jsonb_build_object('username', c.username, 'full_name', c.full_name, 'phone', c.phone),
  now() - interval '60 days', now() - interval '60 days',
  '', '', '', ''
from _cust c;

-- Orders: (key, customer, status, days ago, description, notes, price, decline reason)
create temp table _ord (
  key text primary key, id uuid not null default gen_random_uuid(), customer text, status public.custom_order_status,
  age interval, description text, notes text, price numeric, decline text
) on commit drop;
insert into _ord (key, customer, status, age, description, notes, price, decline) values
  ('liga',    'sample.coachmarco', 'pending',     interval '3 hours',  'Reversible jerseys and shorts for our barangay liga team. Team name on the front, player names and numbers on the back.', 'Please send a layout before printing. Royal blue and white.', null, null),
  ('pe',      'sample.teachjen',   'pending',     interval '26 hours', 'Class PE shirts with the section name on the back.', 'Needed before the intramurals.', null, null),
  ('vball',   'sample.mara',       'accepted',    interval '2 days',   'Volleyball jerseys and spandex for our club, with numbers.', 'Maroon with gold numbers.', 18500, null),
  ('esports', 'sample.paolo',      'in_progress', interval '4 days',   'Long-sleeve esports jerseys with player tags and two sponsor logos.', 'Logos will be sent in high resolution.', 6800, null),
  ('funrun',  'sample.teachjen',   'in_progress', interval '7 days',   'Dri-fit shirts for the school fun run, event logo on the front.', null, 21000, null),
  ('hoops',   'sample.coachmarco', 'ready',       interval '9 days',   'Sublimated basketball jerseys, team crest on the chest.', null, 14250, null),
  ('caps',    'sample.mara',       'completed',   interval '16 days',  'Team caps with an embroidered club logo.', null, 9600, null),
  ('gold',    'sample.paolo',      'declined',    interval '12 days',  'Jerseys with metallic gold numbers.', null, null, 'We can''t print metallic gold ink yet. We can do a matte gold instead.'),
  ('pinnies', 'sample.coachmarco', 'cancelled',   interval '20 days',  'Practice pinnies, two colors.', null, null, null);

insert into public.custom_orders (id, order_number, customer_id, description, notes, total_price, status, decline_reason, accepted_by, accepted_at, ready_at, completed_at, created_at, updated_at)
select o.id,
  -- The number carries the day the order was placed, like a real one.
  'CO-' || to_char((now() - o.age) at time zone 'Asia/Manila', 'YYYYMMDD') || '-' || lpad(nextval('public.custom_orders_order_number_seq')::text, 5, '0'),
  c.id, o.description, o.notes, o.price, o.status, o.decline,
  case when o.price is not null then (select id from public.profiles where role = 'owner' order by created_at limit 1) end,
  case when o.price is not null then now() - o.age + interval '20 hours' end,
  case when o.status in ('ready', 'completed') then now() - o.age + interval '6 days' end,
  case when o.status = 'completed' then now() - o.age + interval '8 days' end,
  now() - o.age, now() - o.age
from _ord o join _cust c on c.username = o.customer;

insert into public.custom_order_items (order_id, garment, color, size, quantity, notes)
select o.id, i.garment, i.color, i.size, i.qty, i.notes
from _ord o join (values
  ('liga', 'Reversible jersey', 'Royal blue / white', 'Assorted (S–XL)', 15, 'Names and numbers to follow'),
  ('liga', 'Basketball shorts', 'Royal blue', 'Assorted (S–XL)', 15, null),
  ('pe', 'Dri-fit shirt', 'Court green', 'Assorted (XS–L)', 40, 'Section name on the back'),
  ('vball', 'Volleyball jersey', 'Maroon', 'Assorted (W-S–W-L)', 12, 'Gold numbers'),
  ('vball', 'Spandex shorts', 'Black', 'Assorted (W-S–W-L)', 12, null),
  ('esports', 'Long-sleeve esports jersey', 'Black / purple', 'Assorted (M–2XL)', 8, 'Player tags on the back'),
  ('funrun', 'Dri-fit shirt', 'Neon yellow', 'Assorted (S–2XL)', 60, 'Event logo on the front'),
  ('hoops', 'Sublimated basketball jersey', 'Black / gold', 'Assorted (M–3XL)', 15, 'Crest on the chest'),
  ('caps', 'Team cap', 'Navy', 'Adjustable', 20, 'Embroidered logo'),
  ('gold', 'Basketball jersey', 'White', 'Assorted (M–XL)', 12, 'Metallic gold numbers'),
  ('pinnies', 'Practice pinnie', 'Orange / green', 'Free size', 24, null)
) as i(key, garment, color, size, qty, notes) on i.key = o.key;

-- Production steps for orders in production or beyond.
insert into public.custom_order_steps (order_id, step, done_at, done_by)
select o.id, s.step::public.production_step, now() - o.age + s.after, (select id from public.profiles where role = 'owner' order by created_at limit 1)
from _ord o join (values
  ('esports', 'printing', interval '2 days'),
  ('esports', 'cutting', interval '3 days'),
  ('funrun', 'printing', interval '4 days'),
  ('funrun', 'cutting', interval '4 days 6 hours'),
  ('funrun', 'sewing', interval '5 days'),
  ('hoops', 'printing', interval '2 days'), ('hoops', 'cutting', interval '3 days'), ('hoops', 'sewing', interval '4 days'),
  ('hoops', 'inspection', interval '5 days'), ('hoops', 'packing', interval '5 days 20 hours'),
  ('caps', 'printing', interval '2 days'), ('caps', 'cutting', interval '3 days'), ('caps', 'sewing', interval '4 days'),
  ('caps', 'inspection', interval '5 days'), ('caps', 'packing', interval '5 days 20 hours')
) as s(key, step, after) on s.key = o.key;

-- The insert triggers wrote one history row per order and notified staff. Replace
-- that with a believable history, and drop the notifications for sample orders.
delete from public.order_status_history where order_id in (select id from _ord);
delete from public.notifications where reference_id in (select id from _ord);

insert into public.order_status_history (order_id, status, note, changed_by, created_at)
select o.id, h.status::public.custom_order_status, h.note,
  case when h.by_customer then c.id else (select id from public.profiles where role = 'owner' order by created_at limit 1) end,
  now() - o.age + h.after
from _ord o join _cust c on c.username = o.customer
join (values
  -- every order starts pending, by the customer
  ('*', 'pending', null, true, interval '0'),
  ('vball', 'accepted', 'Layout approved over chat.', false, interval '20 hours'),
  ('esports', 'accepted', null, false, interval '20 hours'),
  ('esports', 'in_progress', 'Printing done', false, interval '2 days'),
  ('esports', 'in_progress', 'Cutting done', false, interval '3 days'),
  ('funrun', 'accepted', null, false, interval '20 hours'),
  ('funrun', 'in_progress', 'Printing done', false, interval '2 days'),
  ('funrun', 'in_progress', 'Failed inspection, reprinting: logo print smudged on six shirts', false, interval '3 days'),
  ('funrun', 'in_progress', 'Printing done', false, interval '4 days'),
  ('funrun', 'in_progress', 'Cutting done', false, interval '4 days 6 hours'),
  ('funrun', 'in_progress', 'Sewing done', false, interval '5 days'),
  ('hoops', 'accepted', null, false, interval '20 hours'),
  ('hoops', 'in_progress', 'Printing done', false, interval '2 days'),
  ('hoops', 'in_progress', 'Folding and packing done', false, interval '5 days 20 hours'),
  ('hoops', 'ready', null, false, interval '6 days'),
  ('caps', 'accepted', null, false, interval '20 hours'),
  ('caps', 'in_progress', 'Printing done', false, interval '2 days'),
  ('caps', 'ready', null, false, interval '6 days'),
  ('caps', 'completed', 'Picked up by the coach.', false, interval '8 days'),
  ('gold', 'declined', 'We can''t print metallic gold ink yet. We can do a matte gold instead.', false, interval '18 hours'),
  ('pinnies', 'cancelled', 'Changed my mind, sorry!', true, interval '5 hours')
) as h(key, status, note, by_customer, after) on h.key = o.key or h.key = '*';

commit;
