-- =============================================================================
-- Chat: the owner answers customers
-- =============================================================================
-- 1. Customer chat is the owner's: owners read every conversation and reply;
--    staff no longer see customers' messages. Customers write to the shop
--    (no recipient) or to an owner, optionally about one of their orders.
-- 2. A customer writing to the shop notifies every owner, once per customer
--    until it's read (a burst of messages makes one alert, not ten). The alert
--    points at the customer, so it opens their conversation.
-- 3. rpc(chat_inbox): one row per customer conversation, newest first, with the
--    last message and the owner's unread count.
-- 4. Messages are at most 2,000 characters, and their time is the server's
--    (a customer can't backdate or future-date a message).
-- 5. When the owner reads a customer's messages, every owner's alert about that
--    customer clears; older alerts staff can no longer open are marked read.
-- Run after 20261010120000_custom_order_payment_fixes.sql. Safe to run more than once.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Who reads and writes
-- -----------------------------------------------------------------------------

drop policy if exists "chat_messages: read own conversations or staff" on public.chat_messages;
drop policy if exists "chat_messages: read own conversations or owner" on public.chat_messages;
create policy "chat_messages: read own conversations or owner"
  on public.chat_messages for select to authenticated
  using (
    sender_id = (select auth.uid())
    or receiver_id = (select auth.uid())
    or (select public.is_owner())
  );

drop policy if exists "chat_messages: send" on public.chat_messages;
create policy "chat_messages: send"
  on public.chat_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and is_read = false
    and (
      -- The owner writes to a customer.
      (
        (select public.is_owner())
        and receiver_id is not null
        and exists (select 1 from public.profiles p where p.id = receiver_id and p.role = 'customer')
      )
      -- A customer writes to the shop or to an owner, about their own order if any.
      or (
        exists (select 1 from public.profiles me where me.id = (select auth.uid()) and me.role = 'customer')
        and (receiver_id is null or exists (select 1 from public.profiles p where p.id = receiver_id and p.role = 'owner'))
        and (
          order_id is null
          or exists (select 1 from public.custom_orders o where o.id = order_id and o.customer_id = (select auth.uid()))
        )
      )
    )
  );

-- Senders write the message, never its id or time.
revoke insert on public.chat_messages from anon, authenticated;
grant insert (sender_id, receiver_id, order_id, message, is_read) on public.chat_messages to authenticated;

comment on column public.chat_messages.receiver_id is
  'Recipient: a customer (the owner replying), an owner, or null for the shop (every owner reads it).';

drop policy if exists "chat_messages: recipient marks read" on public.chat_messages;
create policy "chat_messages: recipient marks read"
  on public.chat_messages for update to authenticated
  using (
    receiver_id = (select auth.uid())
    or (receiver_id is null and (select public.is_owner()))
  )
  with check (
    receiver_id = (select auth.uid())
    or (receiver_id is null and (select public.is_owner()))
  );


-- -----------------------------------------------------------------------------
-- 2. Notifications
-- -----------------------------------------------------------------------------

create or replace function private.handle_chat_message_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender      text;
  v_sender_role public.user_role;
begin
  if new.is_read then
    return null;
  end if;

  select coalesce(nullif(btrim(full_name), ''), username), role into v_sender, v_sender_role
  from public.profiles where id = new.sender_id;

  if v_sender_role = 'customer' then
    -- To the shop: every owner. To one owner: that owner. One unread alert per customer at a time
    -- (the lock keeps two messages sent together from making two).
    perform pg_advisory_xact_lock(hashtext('chat-alert:' || new.sender_id::text));
    insert into public.notifications (user_id, title, message, type, reference_id)
    select p.id, 'New message from ' || v_sender, left(new.message, 140), 'chat', new.sender_id
    from public.profiles p
    where p.role = 'owner'
      and (new.receiver_id is null or p.id = new.receiver_id)
      and not exists (
        select 1 from public.notifications n
        where n.user_id = p.id and n.type = 'chat' and n.reference_id = new.sender_id and not n.is_read
      );
  elsif new.receiver_id is not null then
    -- The shop to a customer: the order thread when there is one, otherwise the conversation.
    insert into public.notifications (user_id, title, message, type, reference_id)
    values (new.receiver_id, 'New message from ' || v_sender, left(new.message, 140), 'chat', coalesce(new.order_id, new.sender_id));
  end if;
  return null;
end;
$$;


-- Read by one owner, read for all: clear every owner's alert about that customer.
create or replace function private.handle_chat_message_read()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_read and not old.is_read
     and exists (select 1 from public.profiles where id = new.sender_id and role = 'customer') then
    update public.notifications n
    set is_read = true
    from public.profiles p
    where p.id = n.user_id and p.role = 'owner'
      and n.type = 'chat' and n.reference_id = new.sender_id and not n.is_read;
  end if;
  return null;
end;
$$;

drop trigger if exists chat_messages_after_read on public.chat_messages;
create trigger chat_messages_after_read
  after update of is_read on public.chat_messages
  for each row execute function private.handle_chat_message_read();


-- -----------------------------------------------------------------------------
-- 3. The owner's inbox
-- -----------------------------------------------------------------------------

drop function if exists public.chat_inbox();
create or replace function public.chat_inbox()
returns table (
  customer_id        uuid,
  username           text,
  full_name          text,
  last_message       text,
  last_at            timestamptz,
  last_from_customer boolean,
  last_sender_id     uuid,
  last_order_number  text,
  unread             integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with mine as (
    select
      m.*,
      case when s.role = 'customer' then m.sender_id else m.receiver_id end as customer_id,
      s.role = 'customer' as from_customer
    from public.chat_messages m
    join public.profiles s on s.id = m.sender_id
    where public.is_owner()
  ),
  last as (
    select distinct on (customer_id) customer_id, message, created_at, from_customer, sender_id, order_id
    from mine
    where customer_id is not null
    order by customer_id, created_at desc, id desc
  ),
  unread as (
    select customer_id, count(*)::integer as n
    from mine
    where from_customer and not is_read and (receiver_id is null or receiver_id = auth.uid())
    group by customer_id
  )
  select l.customer_id, p.username, p.full_name, l.message, l.created_at, l.from_customer, l.sender_id, o.order_number, coalesce(u.n, 0)
  from last l
  join public.profiles p on p.id = l.customer_id and p.role = 'customer'
  left join public.custom_orders o on o.id = l.order_id
  left join unread u on u.customer_id = l.customer_id
  order by l.created_at desc, l.customer_id;
$$;

revoke execute on function public.chat_inbox() from public, anon;
grant execute on function public.chat_inbox() to authenticated;


-- -----------------------------------------------------------------------------
-- 4. Message length
-- -----------------------------------------------------------------------------

alter table public.chat_messages drop constraint if exists chat_messages_message_length;
alter table public.chat_messages add constraint chat_messages_message_length
  check (char_length(message) <= 2000) not valid;

do $$
begin
  alter table public.chat_messages validate constraint chat_messages_message_length;
exception when check_violation then
  raise notice 'Some older messages are longer than 2,000 characters; new messages are still checked.';
end;
$$;

create index if not exists chat_messages_unread_idx on public.chat_messages (sender_id) where not is_read;


-- -----------------------------------------------------------------------------
-- 5. Tidy what the old rules left behind
-- -----------------------------------------------------------------------------

-- Messages "to the shop" from staff or owners: no conversation shows them, so nobody could read them.
update public.chat_messages m
set is_read = true
from public.profiles p
where p.id = m.sender_id and p.role <> 'customer' and m.receiver_id is null and not m.is_read;

-- Chat alerts held by staff, or pointing at an order rather than a customer: they can't be opened now.
update public.notifications n
set is_read = true
from public.profiles u
where u.id = n.user_id and u.role in ('staff', 'owner')
  and n.type = 'chat' and not n.is_read
  and (
    u.role = 'staff'
    or not exists (select 1 from public.profiles c where c.id = n.reference_id and c.role = 'customer')
  );

