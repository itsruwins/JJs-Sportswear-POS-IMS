-- =============================================================================
-- J&J Sportswear: SAMPLE orders for ONE customer account (demo data only)
-- =============================================================================
-- Gives one existing customer account a custom order at every stage, so the
-- customer app's order tracking and payments can be tried end to end:
--   * accepted, down payment due (an earlier GCash payment was rejected)
--   * accepted, GCash down payment waiting for the shop to check it
--   * in production (printing and cutting done)
--   * in production after a reprint (failed inspection)
--   * ready for pickup, balance due
--   * picked up, fully paid
--   * declined
-- Change the username on the line marked CHANGE ME, then run it once in the
-- Supabase SQL editor (after supabase/migrations/20261013000000_customer_order_requests.sql).
-- Every sample order's description starts with "Sample order:". Remove them with
-- supabase/seed/remove-sample-customer-orders.sql (same username).
-- Prices, payments, and references are illustrative, not the shop's real data.
-- =============================================================================

begin;

create temp table _cfg on commit drop as
select 'c3.test'::text as username;   -- CHANGE ME: the customer account that gets the sample orders

do $$
declare
  v_username text := (select username from _cfg);
  v_customer uuid;
begin
  select id into v_customer from public.profiles where lower(username) = lower(v_username) and role = 'customer';
  if v_customer is null then
    raise exception 'No customer account named "%". Sign up that customer first, or change the username at the top.', v_username;
  end if;
  if not exists (select 1 from public.profiles where role = 'owner') then
    raise exception 'No owner account yet. Sign up and promote the owner first.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'custom_orders' and column_name = 'team_name') then
    raise exception 'Run supabase/migrations/20261013000000_customer_order_requests.sql first.';
  end if;
  if exists (select 1 from public.custom_orders where customer_id = v_customer and description like 'Sample order:%') then
    raise exception 'This account already has sample orders. Run remove-sample-customer-orders.sql first to reload them.';
  end if;
end;
$$;

create temp table _who on commit drop as
select
  (select id from public.profiles where lower(username) = lower((select username from _cfg)) and role = 'customer') as customer,
  (select id from public.profiles where role = 'owner' order by created_at limit 1) as owner;

-- Orders: (key, status, placed days ago, description, team, needed by in days, price, decline reason)
create temp table _ord (
  key text primary key, id uuid not null default gen_random_uuid(), status public.custom_order_status,
  age interval, description text, team text, needed_in integer, price numeric, decline text
) on commit drop;
insert into _ord (key, status, age, description, team, needed_in, price, decline) values
  ('down',     'accepted',    interval '2 days',  'Sample order: Reversible liga jerseys and shorts for the barangay tournament.', 'Mayon Blazers (sample)', 21, 9750, null),
  ('review',   'accepted',    interval '3 days',  'Sample order: Volleyball jerseys and spandex for the club.', 'Daraga Spikers (sample)', 18, 12600, null),
  ('making',   'in_progress', interval '6 days',  'Sample order: Dri-fit PE shirts with the section name on the back.', 'Legazpi High PE (sample)', 10, 8400, null),
  ('reprint',  'in_progress', interval '9 days',  'Sample order: Sublimated basketball jerseys with the team crest.', 'Bicol Hoopers (sample)', 7, 14250, null),
  ('ready',    'ready',       interval '12 days', 'Sample order: Long-sleeve esports jerseys with player tags.', 'Tabaco Titans (sample)', 3, 6800, null),
  ('done',     'completed',   interval '20 days', 'Sample order: Team caps with an embroidered logo.', 'Albay Anglers (sample)', null, 4800, null),
  ('declined', 'declined',    interval '5 days',  'Sample order: Jerseys with metallic gold numbers.', 'Gold Rush (sample)', null, null,
     'We can''t print metallic gold ink yet. We can do a matte gold instead; send a new request if that works.');

insert into public.custom_orders (
  id, order_number, customer_id, description, notes, team_name, needed_by, total_price, status, decline_reason,
  accepted_by, accepted_at, ready_at, completed_at, created_at, updated_at
)
select o.id,
  'CO-' || to_char((now() - o.age) at time zone 'Asia/Manila', 'YYYYMMDD') || '-' || lpad(nextval('public.custom_orders_order_number_seq')::text, 5, '0'),
  w.customer, o.description, null, o.team,
  case when o.needed_in is not null then ((now() at time zone 'Asia/Manila')::date + o.needed_in) end,
  o.price, o.status, o.decline,
  case when o.price is not null then w.owner end,
  case when o.price is not null then now() - o.age + interval '20 hours' end,
  case when o.status in ('ready', 'completed') then now() - o.age + interval '8 days' end,
  case when o.status = 'completed' then now() - o.age + interval '10 days' end,
  now() - o.age, now() - o.age
from _ord o cross join _who w;

-- Garments: one line per size, as the request form saves them.
insert into public.custom_order_items (order_id, garment, color, size, quantity, notes, created_at)
select o.id, i.garment, i.color, i.size, i.qty, i.notes, now() - o.age + make_interval(secs => i.ord / 1000.0)
from _ord o join (values
  ('down', 1, 'Reversible jersey', 'Royal', 'S', 2, 'DELA CRUZ 7 (M)' || chr(10) || 'REYES 23 (L)'),
  ('down', 2, 'Reversible jersey', 'Royal', 'M', 5, null),
  ('down', 3, 'Reversible jersey', 'Royal', 'L', 4, null),
  ('down', 4, 'Reversible jersey', 'Royal', 'XL', 4, null),
  ('down', 5, 'Shorts', 'Royal', 'M', 8, null),
  ('down', 6, 'Shorts', 'Royal', 'L', 7, null),
  ('review', 1, 'Jersey', 'Maroon', 'W-S', 4, 'Gold numbers'),
  ('review', 2, 'Jersey', 'Maroon', 'W-M', 6, null),
  ('review', 3, 'Jersey', 'Maroon', 'W-L', 2, null),
  ('review', 4, 'Shorts', 'Black', 'W-S', 4, null),
  ('review', 5, 'Shorts', 'Black', 'W-M', 6, null),
  ('review', 6, 'Shorts', 'Black', 'W-L', 2, null),
  ('making', 1, 'Dri-fit shirt', 'Court green', '12', 14, 'Section name on the back'),
  ('making', 2, 'Dri-fit shirt', 'Court green', '14', 16, null),
  ('reprint', 1, 'Sublimated jersey', 'Black / gold', 'M', 5, 'Crest on the chest'),
  ('reprint', 2, 'Sublimated jersey', 'Black / gold', 'L', 6, null),
  ('reprint', 3, 'Sublimated jersey', 'Black / gold', '2XL', 4, null),
  ('ready', 1, 'Jersey', 'Black', 'M', 3, 'Player tags on the back'),
  ('ready', 2, 'Jersey', 'Black', 'L', 3, null),
  ('ready', 3, 'Jersey', 'Black', '2XL', 2, null),
  ('done', 1, 'Cap', 'Navy', 'One size', 20, 'Embroidered logo'),
  ('declined', 1, 'Jersey', 'White', 'M', 6, 'Metallic gold numbers'),
  ('declined', 2, 'Jersey', 'White', 'L', 6, null)
) as i(key, ord, garment, color, size, qty, notes) on i.key = o.key;

-- Production steps done so far.
insert into public.custom_order_steps (order_id, step, done_at, done_by)
select o.id, s.step::public.production_step, now() - o.age + s.after, w.owner
from _ord o cross join _who w join (values
  ('making', 'printing', interval '3 days'),
  ('making', 'cutting', interval '4 days'),
  ('reprint', 'printing', interval '6 days'),
  ('reprint', 'cutting', interval '6 days 8 hours'),
  ('reprint', 'sewing', interval '7 days'),
  ('ready', 'printing', interval '3 days'), ('ready', 'cutting', interval '4 days'), ('ready', 'sewing', interval '5 days'),
  ('ready', 'inspection', interval '6 days'), ('ready', 'packing', interval '7 days'),
  ('done', 'printing', interval '3 days'), ('done', 'cutting', interval '4 days'), ('done', 'sewing', interval '5 days'),
  ('done', 'inspection', interval '6 days'), ('done', 'packing', interval '7 days')
) as s(key, step, after) on s.key = o.key;

-- Payments: GCash from the customer (reviewed or waiting), cash taken at the counter.
insert into public.payments (
  order_id, payment_type, amount, method, status, gcash_reference, rejection_reason, verified_by, verified_at, created_at, updated_at
)
select o.id, p.ptype::public.payment_type, p.amount, p.method::public.payment_method, p.status::public.payment_status,
  case when p.method = 'gcash' then lpad((floor(random() * 9e12) + 1e12)::bigint::text, 13, '0') end,
  p.reason,
  case when p.status in ('verified', 'rejected') then w.owner end,
  case when p.status in ('verified', 'rejected') then now() - o.age + p.after + interval '3 hours' end,
  now() - o.age + p.after, now() - o.age + p.after
from _ord o cross join _who w join (values
  ('down', 'down_payment', 4875, 'gcash', 'rejected', interval '1 day',
     'The reference number doesn''t match a GCash transfer we received. Please check it and send it again.'),
  ('review', 'down_payment', 6300, 'gcash', 'submitted', interval '2 days', null),
  ('making', 'down_payment', 4200, 'gcash', 'verified', interval '1 day', null),
  ('reprint', 'down_payment', 7200, 'cash', 'verified', interval '1 day', null),
  ('ready', 'down_payment', 3400, 'gcash', 'verified', interval '1 day', null),
  ('done', 'down_payment', 2400, 'gcash', 'verified', interval '1 day', null),
  ('done', 'balance', 2400, 'cash', 'verified', interval '10 days', null)
) as p(key, ptype, amount, method, status, after, reason) on p.key = o.key;

-- The insert triggers wrote one history row per order and notified people.
-- Replace that with a believable history, and drop the notifications.
delete from public.order_status_history where order_id in (select id from _ord);
delete from public.notifications where reference_id in (select id from _ord);
delete from public.notifications where reference_id in (select id from public.payments where order_id in (select id from _ord));

insert into public.order_status_history (order_id, status, note, changed_by, created_at)
select o.id, h.status::public.custom_order_status, h.note,
  case when h.by_customer then w.customer else w.owner end,
  now() - o.age + h.after
from _ord o cross join _who w join (values
  ('*', 'pending', null, true, interval '0'),
  ('down', 'accepted', null, false, interval '20 hours'),
  ('review', 'accepted', null, false, interval '20 hours'),
  ('making', 'accepted', null, false, interval '20 hours'),
  ('making', 'in_progress', null, false, interval '2 days'),
  ('making', 'in_progress', 'Printing done', false, interval '3 days'),
  ('making', 'in_progress', 'Cutting done', false, interval '4 days'),
  ('reprint', 'accepted', null, false, interval '20 hours'),
  ('reprint', 'in_progress', null, false, interval '2 days'),
  ('reprint', 'in_progress', 'Printing done', false, interval '3 days'),
  ('reprint', 'in_progress', 'Cutting done', false, interval '3 days 6 hours'),
  ('reprint', 'in_progress', 'Sewing done', false, interval '4 days'),
  ('reprint', 'in_progress', 'Failed inspection, reprinting: the crest print smudged on four jerseys', false, interval '5 days'),
  ('reprint', 'in_progress', 'Printing done', false, interval '6 days'),
  ('reprint', 'in_progress', 'Cutting done', false, interval '6 days 8 hours'),
  ('reprint', 'in_progress', 'Sewing done', false, interval '7 days'),
  ('ready', 'accepted', null, false, interval '20 hours'),
  ('ready', 'in_progress', null, false, interval '2 days'),
  ('ready', 'in_progress', 'Printing done', false, interval '3 days'),
  ('ready', 'in_progress', 'Folding and packing done', false, interval '7 days'),
  ('ready', 'ready', null, false, interval '8 days'),
  ('done', 'accepted', null, false, interval '20 hours'),
  ('done', 'in_progress', null, false, interval '2 days'),
  ('done', 'ready', null, false, interval '8 days'),
  ('done', 'completed', 'Picked up by the team captain.', false, interval '10 days'),
  ('declined', 'declined', 'We can''t print metallic gold ink yet. We can do a matte gold instead; send a new request if that works.', false, interval '18 hours')
) as h(key, status, note, by_customer, after) on h.key = o.key or h.key = '*';

commit;
