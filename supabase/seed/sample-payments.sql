-- =============================================================================
-- J&J Sportswear: SAMPLE payments for the sample custom orders (demo data only)
-- =============================================================================
-- Run once in the Supabase SQL editor, after sample-custom-orders.sql and after
-- supabase/migrations/20261010000000_custom_order_payments.sql. Adds payments to
-- the sample orders: down payments already recorded, customer GCash payments
-- waiting in the review queue, one rejected payment, and a fully paid order. They
-- go away with remove-sample-custom-orders.sql. GCash reference numbers here are
-- made up.
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.custom_order_refunds') is null then
    raise exception 'Run supabase/migrations/20261010000000_custom_order_payments.sql first.';
  end if;
  if not exists (select 1 from auth.users where raw_app_meta_data ->> 'sample' = 'true') then
    raise exception 'Load sample-custom-orders.sql first.';
  end if;
  if exists (
    select 1 from public.payments p
    join public.custom_orders o on o.id = p.order_id
    join auth.users u on u.id = o.customer_id
    where u.raw_app_meta_data ->> 'sample' = 'true'
  ) then
    raise exception 'Sample payments are already loaded.';
  end if;
end;
$$;

create temp table _orders on commit drop as
select o.id, o.description, o.total_price, o.accepted_at, o.created_at
from public.custom_orders o
join auth.users u on u.id = o.customer_id
where u.raw_app_meta_data ->> 'sample' = 'true';

create temp table _pay (
  id uuid default gen_random_uuid(), match text, type public.payment_type, amount numeric, method public.payment_method,
  status public.payment_status, ref text, reason text, note text, after interval
) on commit drop;

-- match: a word from the sample order's description; after: time since the order was accepted.
insert into _pay (match, type, amount, method, status, ref, reason, note, after) values
  ('Volleyball', 'down_payment', 9250, 'gcash', 'rejected',  '9001234567890', 'The reference number isn''t in our GCash history. Please check and send it again.', null, interval '4 hours'),
  ('Volleyball', 'down_payment', 9250, 'gcash', 'submitted', '9001234567891', null, null, interval '18 hours'),
  ('esports',    'down_payment', 3400, 'cash',  'verified',  null, null, 'Paid at the counter.', interval '1 hour'),
  ('fun run',    'down_payment', 10500, 'gcash', 'verified', '9001234567892', null, 'Sent to the shop GCash.', interval '2 hours'),
  ('fun run',    'balance',      4000, 'gcash', 'submitted', '9001234567893', null, null, interval '5 days'),
  ('basketball jerseys', 'down_payment', 7125, 'cash', 'verified', null, null, null, interval '3 hours'),
  ('basketball jerseys', 'balance',      7125, 'gcash', 'submitted', '9001234567894', null, null, interval '5 days 4 hours'),
  ('caps',       'down_payment', 4800, 'cash',  'verified',  null, null, null, interval '1 hour'),
  ('caps',       'balance',      4800, 'gcash', 'verified',  '9001234567895', null, 'Paid the balance before pickup.', interval '7 days');

insert into public.payments (id, order_id, payment_type, amount, method, status, gcash_reference, rejection_reason, note, verified_by, created_at, updated_at)
select p.id, o.id, p.type, p.amount, p.method, p.status, p.ref, p.reason, p.note,
  case when p.status in ('verified', 'rejected') then (select id from public.profiles where role = 'owner' order by created_at limit 1) end,
  o.accepted_at + p.after, o.accepted_at + p.after
from _pay p
join _orders o on o.description ilike '%' || p.match || '%';

-- The write triggers stamped "now" and notified everyone; give the payments their own
-- review times and drop the notifications.
update public.payments x set verified_at = x.created_at + interval '35 minutes'
from _pay p where x.id = p.id and p.status in ('verified', 'rejected');
delete from public.notifications where reference_id in (select id from _pay);

commit;
