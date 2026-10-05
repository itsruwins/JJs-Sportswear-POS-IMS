-- =============================================================================
-- J&J Sportswear: SAMPLE chat conversations (demo data only)
-- =============================================================================
-- Run once in the Supabase SQL editor, after sample-custom-orders.sql and after
-- supabase/migrations/20261011000000_owner_chat.sql. Adds conversations between
-- the four sample customers and the shop's owner: some about their orders, some
-- general, three still unread. They go away with remove-sample-custom-orders.sql.
-- =============================================================================

begin;

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'chat_inbox') then
    raise exception 'Run supabase/migrations/20261011000000_owner_chat.sql first.';
  end if;
  if not exists (select 1 from auth.users where raw_app_meta_data ->> 'sample' = 'true') then
    raise exception 'Load sample-custom-orders.sql first.';
  end if;
  if not exists (select 1 from public.profiles where role = 'owner') then
    raise exception 'The shop needs an owner account first.';
  end if;
  if exists (
    select 1 from public.chat_messages m
    join auth.users u on u.id in (m.sender_id, m.receiver_id)
    where u.raw_app_meta_data ->> 'sample' = 'true'
  ) then
    raise exception 'Sample chats are already loaded.';
  end if;
end;
$$;

create temp table _who on commit drop as
select p.username, p.id
from public.profiles p
join auth.users u on u.id = p.id
where u.raw_app_meta_data ->> 'sample' = 'true';

create temp table _owner on commit drop as
select id from public.profiles where role = 'owner' order by created_at limit 1;

-- Each sample order, found by a word from its description.
create temp table _ord on commit drop as
select o.id, o.description
from public.custom_orders o
join auth.users u on u.id = o.customer_id
where u.raw_app_meta_data ->> 'sample' = 'true';

-- (customer, from customer?, order word or null, message, time ago, read?)
create temp table _msg (
  n int, customer text, from_customer boolean, about text, message text, ago interval, is_read boolean
) on commit drop;
insert into _msg values
  -- Marco: his basketball jerseys are ready; asking about pickup (unread).
  (1,  'sample.coachmarco', true,  'basketball jerseys', 'Hi! Are the basketball jerseys done? Our first game is on Sunday.', interval '2 days 3 hours', true),
  (2,  'sample.coachmarco', false, 'basketball jerseys', 'Hi Coach! They''re in sewing now. We''ll message you as soon as they''re ready.', interval '2 days 2 hours', true),
  (3,  'sample.coachmarco', false, 'basketball jerseys', 'Good news: your jerseys are ready for pickup. The balance is ₱7,125.', interval '20 hours', true),
  (4,  'sample.coachmarco', true,  'basketball jerseys', 'Great, thank you! Can I pick them up Saturday morning? I sent the balance by GCash.', interval '50 minutes', false),
  (5,  'sample.coachmarco', true,  null,                 'Also, do you still have the reversible jerseys in size L? Need 3 more.', interval '48 minutes', false),
  -- Mara: her GCash down payment was rejected; she sent it again (unread).
  (6,  'sample.mara',       false, 'Volleyball',         'Hi Mara, we couldn''t find your GCash reference in our history. Could you check it and send it again?', interval '4 hours', true),
  (7,  'sample.mara',       true,  'Volleyball',         'Sorry about that! I sent it again with the right reference number. Please check.', interval '3 hours', false),
  -- Jen: sizing question, answered (all read).
  (8,  'sample.teachjen',   true,  'fun run',            'Good morning! Can we add 5 more shirts in size XS for the fun run?', interval '3 days', true),
  (9,  'sample.teachjen',   false, 'fun run',            'Good morning, Ma''am Jen! Yes, we can add them before printing. That''s ₱1,250 more; we''ll update the total.', interval '2 days 23 hours', true),
  (10, 'sample.teachjen',   true,  'fun run',            'Perfect, thank you!', interval '2 days 22 hours', true),
  -- Paolo: a general question, not about an order (unread).
  (11, 'sample.paolo',      true,  null,                 'Hello, do you do embroidered team patches? How long would 30 pieces take?', interval '6 hours', false);

insert into public.chat_messages (sender_id, receiver_id, order_id, message, is_read, created_at)
select
  case when m.from_customer then c.id else (select id from _owner) end,
  case when m.from_customer then null else c.id end,
  (select o.id from _ord o where m.about is not null and o.description ilike '%' || m.about || '%' limit 1),
  m.message,
  m.is_read,
  now() - m.ago
from _msg m
join _who c on c.username = m.customer
order by m.n;

-- The owner's replies notified the sample customers; those alerts aren't needed here.
delete from public.notifications n
using _who c
where n.user_id = c.id and n.type = 'chat';

commit;
