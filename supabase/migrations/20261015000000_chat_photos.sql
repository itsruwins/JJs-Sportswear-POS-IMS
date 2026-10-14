-- =============================================================================
-- Chat: photo messages (customer chat widget, phase C6)
-- =============================================================================
-- 1. A message can carry one photo: chat_messages.image_path, a file in the
--    private chat-photos bucket under the sender's own folder
--    (<sender id>/<uuid>.<jpg|png|webp>). A photo-only message has empty text.
-- 2. Who sees a photo: its sender, and everyone who can read the message it's on
--    (the customer in that conversation, and owners).
-- 3. Alerts and the owner's inbox say "Sent a photo" for a photo-only message.
-- Run after 20261014120000_ai_designs_keep.sql. Safe to run more than once.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The photo column
-- -----------------------------------------------------------------------------

alter table public.chat_messages add column if not exists image_path text;

comment on column public.chat_messages.image_path is
  'Optional photo: a path in the private chat-photos bucket, in the sender''s folder.';

alter table public.chat_messages drop constraint if exists chat_messages_image_path_format;
alter table public.chat_messages add constraint chat_messages_image_path_format
  check (image_path is null or image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$');

-- Text or a photo (or both). Replaces the original "text can't be empty" check.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.chat_messages'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%length(TRIM(BOTH FROM message)) > 0%'
      and conname <> 'chat_messages_text_or_photo'
  loop
    execute format('alter table public.chat_messages drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.chat_messages drop constraint if exists chat_messages_text_or_photo;
alter table public.chat_messages add constraint chat_messages_text_or_photo
  check (length(trim(message)) > 0 or image_path is not null);

-- Senders may now write the photo too (still never the id or time).
grant insert (sender_id, receiver_id, order_id, message, is_read, image_path) on public.chat_messages to authenticated;

-- The photo must be the sender's own upload.
drop policy if exists "chat_messages: send" on public.chat_messages;
create policy "chat_messages: send"
  on public.chat_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and is_read = false
    and (image_path is null or split_part(image_path, '/', 1) = (select auth.uid())::text)
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

create index if not exists chat_messages_image_path_idx on public.chat_messages (image_path) where image_path is not null;


-- -----------------------------------------------------------------------------
-- 2. The chat-photos bucket
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-photos', 'chat-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "chat-photos: upload own" on storage.objects;
create policy "chat-photos: upload own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- A sender can take back an upload no message uses yet (a send that failed).
-- Photos on sent messages stay, like the messages themselves.
drop policy if exists "chat-photos: delete own unsent" on storage.objects;
create policy "chat-photos: delete own unsent"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (select 1 from public.chat_messages m where m.image_path = storage.objects.name)
  );

-- Your own uploads, plus any photo on a message you can read (the message's own
-- read policy decides that: your conversation, or every conversation for owners).
drop policy if exists "chat-photos: read own or in your conversation" on storage.objects;
create policy "chat-photos: read own or in your conversation"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (select 1 from public.chat_messages m where m.image_path = storage.objects.name)
    )
  );


-- -----------------------------------------------------------------------------
-- 3. Alerts and the inbox for photo-only messages
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
  v_text        text := coalesce(nullif(btrim(new.message), ''), 'Sent a photo');
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
    select p.id, 'New message from ' || v_sender, left(v_text, 140), 'chat', new.sender_id
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
    values (new.receiver_id, 'New message from ' || v_sender, left(v_text, 140), 'chat', coalesce(new.order_id, new.sender_id));
  end if;
  return null;
end;
$$;

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
    select distinct on (customer_id) customer_id, message, image_path, created_at, from_customer, sender_id, order_id
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
  select l.customer_id, p.username, p.full_name,
         coalesce(nullif(btrim(l.message), ''), case when l.image_path is not null then 'Sent a photo' end, ''),
         l.created_at, l.from_customer, l.sender_id, o.order_number, coalesce(u.n, 0)
  from last l
  join public.profiles p on p.id = l.customer_id and p.role = 'customer'
  left join public.custom_orders o on o.id = l.order_id
  left join unread u on u.customer_id = l.customer_id
  order by l.created_at desc, l.customer_id;
$$;

revoke execute on function public.chat_inbox() from public, anon;
grant execute on function public.chat_inbox() to authenticated;
