-- Removes the chat messages the C6 browser checks sent as the test customer (c3.test),
-- and the owner alerts they raised. Run in the Supabase SQL editor when you're done testing.
with c as (select id from public.profiles where username = 'c3.test' and role = 'customer')
delete from public.chat_messages m
using c
where m.sender_id = c.id
  and (m.message like 'TEST (C6 check)%' or m.message like 'Hi! I have a question about my order %');

delete from public.notifications n
using public.profiles c
where c.username = 'c3.test' and c.role = 'customer'
  and n.type = 'chat' and n.reference_id = c.id;
