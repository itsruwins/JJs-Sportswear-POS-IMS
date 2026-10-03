-- =============================================================================
-- J&J Sportswear MVP — Initial schema (complete)
-- Source: "J&J Sportswear ERD.pdf" (15 tables, 23 foreign-key relationships)
--
-- Functional areas:
--   Users & Accounts         profiles
--   Catalog & Inventory      products, product_images, product_tags,
--                            product_variants, inventory_transactions
--   Point of Sale            sales, sale_items
--   Custom Orders & Payments ai_designs, custom_orders, custom_order_items,
--                            order_status_history, payments
--   Communication            chat_messages, notifications
--
-- Contents:
--    1. Schemas, enum types, sequences
--    2. Tables and indexes
--    3. Role helper functions (used by RLS)
--    4. Internal helpers and triggers
--    5. RPC functions (callable with supabase.rpc)
--    6. Row Level Security policies
--    7. Column-level privileges
--    8. Storage buckets and policies
--    9. Realtime
--
-- Setup notes
--   * Sign-up: Supabase Auth must have email confirmation turned off. The app
--     signs users up with a placeholder email derived from the username
--     (e.g. `${username}@jjsportswear.local`) and passes
--     options.data = { username, full_name, phone, email }. A trigger creates
--     the profile as a 'customer'. Usernames cannot be changed afterwards,
--     because the login email is derived from them.
--   * First owner: after the owner signs up, run once in the SQL editor:
--       update public.profiles set role = 'owner' where username = '<username>';
--     From then on, owners assign roles with rpc('set_user_role').
--   * Stock: product_variants.stock_quantity cannot be updated directly. Use
--     rpc('adjust_stock') or rpc('create_pos_sale') so every change is logged
--     in inventory_transactions.
--   * Storage path conventions (first folder is checked by the policies):
--       avatars/{user_id}/...                      public
--       product-images/{product_id}/...            public
--       ai-designs/{customer_id}/...               private
--       payment-proofs/{customer_id}/{order_id}/...private
--       order-photos/{order_id}/...                private
-- =============================================================================


-- =============================================================================
-- 1. SCHEMAS, ENUM TYPES, SEQUENCES
-- =============================================================================

-- Internal functions live outside the API-exposed public schema.
create schema if not exists private;
revoke all on schema private from public;

create type public.user_role as enum ('customer', 'staff', 'owner');

create type public.inventory_transaction_type as enum (
  'restock', 'sale', 'adjustment', 'damage', 'return'
);

create type public.payment_method as enum ('cash', 'gcash');

create type public.custom_order_status as enum (
  'pending',      -- submitted by customer, awaiting staff review
  'accepted',     -- accepted by staff/owner (accepted_at, total_price set)
  'declined',     -- declined by staff/owner (decline_reason)
  'in_progress',  -- in production
  'ready',        -- finished, awaiting pickup (ready_at)
  'completed',    -- handed over (completed_at)
  'cancelled'
);

create type public.payment_type as enum ('down_payment', 'balance');

create type public.payment_status as enum ('pending', 'submitted', 'verified', 'rejected');

create sequence public.sales_receipt_number_seq;
create sequence public.custom_orders_order_number_seq;


-- =============================================================================
-- 2. TABLES AND INDEXES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Users & Accounts
-- -----------------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null
              constraint profiles_username_format
              check (username ~ '^[A-Za-z0-9_.]{3,30}$'),
  email       text,
  full_name   text,
  phone       text,
  role        public.user_role not null default 'customer',
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'User profile information and application roles. One row per Supabase Auth user.';
comment on column public.profiles.username is 'Login name chosen at sign-up; unique (case-insensitive) and immutable.';
comment on column public.profiles.email is 'Optional contact/recovery email; not required to sign up.';

-- Usernames are unique regardless of case ("JJ" and "jj" are the same user).
create unique index profiles_username_key on public.profiles (lower(username));
create index profiles_role_idx on public.profiles (role);


-- -----------------------------------------------------------------------------
-- Catalog & Inventory
-- -----------------------------------------------------------------------------

create table public.products (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  base_price   numeric(12, 2) not null check (base_price >= 0),
  is_active    boolean not null default true,
  created_by   uuid not null default auth.uid()
               references public.profiles (id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.products is 'Main product/catalog information.';

create index products_created_by_idx on public.products (created_by);
create index products_is_active_idx on public.products (is_active);


create table public.product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  image_url   text not null,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.product_images is 'Images associated with products.';

create index product_images_product_id_idx on public.product_images (product_id);
-- At most one primary image per product.
create unique index product_images_one_primary_key
  on public.product_images (product_id) where is_primary;


create table public.product_tags (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  tag         text not null check (length(trim(tag)) > 0),
  created_at  timestamptz not null default now()
);

comment on table public.product_tags is 'Searchable keywords/tags associated with products, e.g. basketball, jersey, black.';

create unique index product_tags_product_tag_key on public.product_tags (product_id, lower(tag));
create index product_tags_tag_idx on public.product_tags (lower(tag));


create table public.product_variants (
  id                   uuid primary key default gen_random_uuid(),
  product_id           uuid not null references public.products (id) on delete cascade,
  size                 text,
  color                text,
  sku                  text unique,
  price                numeric(12, 2) not null check (price >= 0),
  stock_quantity       integer not null default 0 check (stock_quantity >= 0),
  low_stock_threshold  integer not null default 5 check (low_stock_threshold >= 0),
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.product_variants is 'Product-specific size, color, SKU, price, and stock information.';
comment on column public.product_variants.stock_quantity is 'Current stock. Change it only through rpc(adjust_stock) / rpc(create_pos_sale).';

create index product_variants_product_id_idx on public.product_variants (product_id);
-- One variant per size/color combination of a product.
create unique index product_variants_product_size_color_key
  on public.product_variants (product_id, coalesce(size, ''), coalesce(color, ''));


create table public.inventory_transactions (
  id                uuid primary key default gen_random_uuid(),
  variant_id        uuid not null references public.product_variants (id) on delete restrict,
  transaction_type  public.inventory_transaction_type not null,
  quantity          integer not null check (quantity <> 0),
  previous_stock    integer not null check (previous_stock >= 0),
  new_stock         integer not null check (new_stock >= 0),
  reason            text,
  reference_id      uuid,
  created_by        uuid not null references public.profiles (id) on delete restrict,
  created_at        timestamptz not null default now(),
  constraint inventory_transactions_stock_math
    check (new_stock = previous_stock + quantity)
);

comment on table public.inventory_transactions is 'History of changes made to product inventory.';
comment on column public.inventory_transactions.quantity is 'Signed change in stock: positive adds stock (restock, return), negative removes it (sale, damage).';
comment on column public.inventory_transactions.reference_id is 'Related record (e.g. sales.id); not a foreign key because it can point to different tables.';

create index inventory_transactions_variant_id_idx on public.inventory_transactions (variant_id, created_at desc);
create index inventory_transactions_created_by_idx on public.inventory_transactions (created_by);
create index inventory_transactions_reference_id_idx on public.inventory_transactions (reference_id);


-- -----------------------------------------------------------------------------
-- Point of Sale
-- -----------------------------------------------------------------------------

create table public.sales (
  id              uuid primary key default gen_random_uuid(),
  receipt_number  text not null unique
                  default 'RCPT-' || to_char(now() at time zone 'Asia/Manila', 'YYYYMMDD')
                          || '-' || lpad(nextval('public.sales_receipt_number_seq')::text, 6, '0'),
  cashier_id      uuid not null references public.profiles (id) on delete restrict,
  subtotal        numeric(12, 2) not null check (subtotal >= 0),
  amount_paid     numeric(12, 2) not null check (amount_paid >= 0),
  change_amount   numeric(12, 2) not null default 0 check (change_amount >= 0),
  payment_method  public.payment_method not null,
  created_at      timestamptz not null default now(),
  constraint sales_amount_paid_covers_subtotal check (amount_paid >= subtotal)
);

comment on table public.sales is 'POS sale/receipt information. Created through rpc(create_pos_sale).';

create index sales_cashier_id_idx on public.sales (cashier_id);
create index sales_created_at_idx on public.sales (created_at desc);


create table public.sale_items (
  id          uuid primary key default gen_random_uuid(),
  sale_id     uuid not null references public.sales (id) on delete cascade,
  variant_id  uuid not null references public.product_variants (id) on delete restrict,
  quantity    integer not null check (quantity > 0),
  unit_price  numeric(12, 2) not null check (unit_price >= 0),
  subtotal    numeric(12, 2) generated always as (quantity * unit_price) stored
);

comment on table public.sale_items is 'Individual products/variants included in a POS sale.';
comment on column public.sale_items.subtotal is 'Derived: quantity * unit_price.';

create index sale_items_sale_id_idx on public.sale_items (sale_id);
create index sale_items_variant_id_idx on public.sale_items (variant_id);


-- -----------------------------------------------------------------------------
-- Custom Orders & Payments
-- -----------------------------------------------------------------------------

create table public.ai_designs (
  id                   uuid primary key default gen_random_uuid(),
  customer_id          uuid not null default auth.uid()
                       references public.profiles (id) on delete cascade,
  prompt               text not null,
  generated_image_url  text,
  attempt_date         date not null default (now() at time zone 'Asia/Manila')::date,
  attempt_number       integer not null default 1 check (attempt_number > 0),
  created_at           timestamptz not null default now(),
  constraint ai_designs_attempt_key unique (customer_id, attempt_date, attempt_number)
);

comment on table public.ai_designs is 'Customer AI design requests and generated design references.';
comment on column public.ai_designs.attempt_number is 'Set automatically: the customer''s Nth attempt on attempt_date (Asia/Manila).';

create index ai_designs_customer_id_idx on public.ai_designs (customer_id, attempt_date desc);


create table public.custom_orders (
  id                  uuid primary key default gen_random_uuid(),
  order_number        text not null unique
                      default 'CO-' || to_char(now() at time zone 'Asia/Manila', 'YYYYMMDD')
                              || '-' || lpad(nextval('public.custom_orders_order_number_seq')::text, 5, '0'),
  customer_id         uuid not null default auth.uid()
                      references public.profiles (id) on delete restrict,
  ai_design_id        uuid references public.ai_designs (id) on delete set null,
  description         text,
  notes               text,
  total_price         numeric(12, 2) check (total_price >= 0),
  status              public.custom_order_status not null default 'pending',
  decline_reason      text,
  finished_photo_url  text,
  accepted_by         uuid references public.profiles (id) on delete set null,
  accepted_at         timestamptz,
  ready_at            timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint custom_orders_decline_reason_required
    check (status <> 'declined' or decline_reason is not null)
);

comment on table public.custom_orders is 'Customer custom-order information and its overall status.';
comment on column public.custom_orders.total_price is 'Accepted total order price; required before the order can be accepted.';

create index custom_orders_customer_id_idx on public.custom_orders (customer_id, created_at desc);
create index custom_orders_ai_design_id_idx on public.custom_orders (ai_design_id);
create index custom_orders_accepted_by_idx on public.custom_orders (accepted_by);
create index custom_orders_status_idx on public.custom_orders (status, created_at desc);


create table public.custom_order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.custom_orders (id) on delete cascade,
  garment     text not null,
  color       text,
  size        text,
  quantity    integer not null check (quantity > 0),
  notes       text,
  created_at  timestamptz not null default now()
);

comment on table public.custom_order_items is 'Garments/items included in a custom order.';

create index custom_order_items_order_id_idx on public.custom_order_items (order_id);


create table public.order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.custom_orders (id) on delete cascade,
  status      public.custom_order_status not null,
  note        text,
  changed_by  uuid not null references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now()
);

comment on table public.order_status_history is 'History of status changes for custom orders. Written automatically by triggers.';

create index order_status_history_order_id_idx on public.order_status_history (order_id, created_at);
create index order_status_history_changed_by_idx on public.order_status_history (changed_by);


create table public.payments (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.custom_orders (id) on delete restrict,
  payment_type          public.payment_type not null,
  amount                numeric(12, 2) not null check (amount > 0),
  method                public.payment_method not null,
  status                public.payment_status not null default 'pending',
  gcash_reference       text,
  gcash_screenshot_url  text,
  verified_by           uuid references public.profiles (id) on delete set null,
  verified_at           timestamptz,
  rejection_reason      text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint payments_rejection_reason_required
    check (status <> 'rejected' or rejection_reason is not null),
  constraint payments_gcash_proof_required
    check (method <> 'gcash' or status = 'pending'
           or gcash_reference is not null or gcash_screenshot_url is not null)
);

comment on table public.payments is 'Down-payment and balance payment records for custom orders.';
comment on column public.payments.verified_by is 'Staff/owner who reviewed the payment (verified or rejected). Set automatically.';

create index payments_order_id_idx on public.payments (order_id);
create index payments_verified_by_idx on public.payments (verified_by);
create index payments_status_idx on public.payments (status, created_at desc);


-- -----------------------------------------------------------------------------
-- Communication
-- -----------------------------------------------------------------------------

create table public.chat_messages (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null default auth.uid()
               references public.profiles (id) on delete cascade,
  receiver_id  uuid references public.profiles (id) on delete set null,
  order_id     uuid references public.custom_orders (id) on delete set null,
  message      text not null check (length(trim(message)) > 0),
  is_read      boolean not null default false,
  created_at   timestamptz not null default now()
);

comment on table public.chat_messages is 'Customer/staff chat messages, optionally tied to a custom order.';
comment on column public.chat_messages.receiver_id is 'Recipient. Null means the message is addressed to the shop (any staff/owner).';

create index chat_messages_sender_id_idx on public.chat_messages (sender_id, created_at desc);
create index chat_messages_receiver_id_idx on public.chat_messages (receiver_id, created_at desc);
create index chat_messages_order_id_idx on public.chat_messages (order_id, created_at);


create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  title         text not null,
  message       text,
  type          text not null,
  reference_id  uuid,
  is_read       boolean not null default false,
  created_at    timestamptz not null default now()
);

comment on table public.notifications is 'User notifications. Created by triggers; users can only mark them read or delete them.';
comment on column public.notifications.type is 'Notification category: custom_order, order_status, payment, low_stock, chat.';
comment on column public.notifications.reference_id is 'Related record identifier; not a foreign key because it can point to different tables.';

create index notifications_user_id_idx on public.notifications (user_id, is_read, created_at desc);


-- =============================================================================
-- 3. ROLE HELPER FUNCTIONS (used by RLS policies)
-- SECURITY DEFINER so they can read profiles without recursing into its RLS.
-- =============================================================================

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() in ('staff', 'owner'), false);
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() = 'owner', false);
$$;


-- =============================================================================
-- 4. INTERNAL HELPERS AND TRIGGERS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- updated_at
-- -----------------------------------------------------------------------------

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create trigger products_set_updated_at
  before update on public.products
  for each row execute function private.set_updated_at();

create trigger product_variants_set_updated_at
  before update on public.product_variants
  for each row execute function private.set_updated_at();

create trigger custom_orders_set_updated_at
  before update on public.custom_orders
  for each row execute function private.set_updated_at();

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function private.set_updated_at();


-- -----------------------------------------------------------------------------
-- Notifications helper: one notification per staff/owner
-- -----------------------------------------------------------------------------

create or replace function private.notify_staff(
  p_title        text,
  p_message      text,
  p_type         text,
  p_reference_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, title, message, type, reference_id)
  select id, p_title, p_message, p_type, p_reference_id
  from public.profiles
  where role in ('staff', 'owner');
$$;


-- -----------------------------------------------------------------------------
-- Auth: create a profile when a user signs up
-- Every new account is a 'customer'. A missing or duplicate username makes the
-- sign-up fail.
-- -----------------------------------------------------------------------------

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, full_name, phone, email, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'email',
    'customer'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();


-- -----------------------------------------------------------------------------
-- Inventory: the single place stock is changed and logged
-- p_quantity is a signed delta. Locks the variant row.
-- -----------------------------------------------------------------------------

create or replace function private.apply_stock_change(
  p_variant_id   uuid,
  p_quantity     integer,
  p_type         public.inventory_transaction_type,
  p_reason       text,
  p_reference_id uuid,
  p_actor        uuid
)
returns public.inventory_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous integer;
  v_tx       public.inventory_transactions;
begin
  select stock_quantity into v_previous
  from public.product_variants
  where id = p_variant_id
  for update;

  if not found then
    raise exception 'Product variant % not found', p_variant_id using errcode = 'P0002';
  end if;

  if v_previous + p_quantity < 0 then
    raise exception 'Insufficient stock: % available, % requested', v_previous, -p_quantity
      using errcode = 'P0001';
  end if;

  update public.product_variants
  set stock_quantity = v_previous + p_quantity
  where id = p_variant_id;

  insert into public.inventory_transactions
    (variant_id, transaction_type, quantity, previous_stock, new_stock, reason, reference_id, created_by)
  values
    (p_variant_id, p_type, p_quantity, v_previous, v_previous + p_quantity, p_reason, p_reference_id, p_actor)
  returning * into v_tx;

  return v_tx;
end;
$$;


-- Log the opening stock when a variant is created with stock > 0.
create or replace function private.log_initial_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stock_quantity > 0 and auth.uid() is not null then
    insert into public.inventory_transactions
      (variant_id, transaction_type, quantity, previous_stock, new_stock, reason, created_by)
    values
      (new.id, 'restock', new.stock_quantity, 0, new.stock_quantity, 'Initial stock', auth.uid());
  end if;
  return null;
end;
$$;

create trigger product_variants_log_initial_stock
  after insert on public.product_variants
  for each row execute function private.log_initial_stock();


-- Notify staff when a variant drops to or below its low-stock threshold.
create or replace function private.notify_low_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text;
begin
  if new.stock_quantity <= new.low_stock_threshold
     and old.stock_quantity > old.low_stock_threshold then
    select p.name || coalesce(' (' || nullif(concat_ws(' / ', new.size, new.color), '') || ')', '')
    into v_label
    from public.products p
    where p.id = new.product_id;

    perform private.notify_staff(
      'Low stock',
      format('%s has %s left.', v_label, new.stock_quantity),
      'low_stock',
      new.id
    );
  end if;
  return null;
end;
$$;

create trigger product_variants_notify_low_stock
  after update of stock_quantity on public.product_variants
  for each row execute function private.notify_low_stock();


-- -----------------------------------------------------------------------------
-- AI designs: number each customer's attempts per day (Asia/Manila)
-- -----------------------------------------------------------------------------

create or replace function private.set_ai_design_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.attempt_date := (now() at time zone 'Asia/Manila')::date;

  select coalesce(max(attempt_number), 0) + 1
  into new.attempt_number
  from public.ai_designs
  where customer_id = new.customer_id
    and attempt_date = new.attempt_date;

  return new;
end;
$$;

create trigger ai_designs_set_attempt
  before insert on public.ai_designs
  for each row execute function private.set_ai_design_attempt();


-- -----------------------------------------------------------------------------
-- Custom orders: milestones, status history, notifications
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

  case new.status
    when 'accepted' then
      if new.total_price is null then
        raise exception 'Set the total price before accepting order %', new.order_number
          using errcode = 'P0001';
      end if;
      new.accepted_at := coalesce(new.accepted_at, now());
      new.accepted_by := coalesce(new.accepted_by, auth.uid());
    when 'ready' then
      new.ready_at := coalesce(new.ready_at, now());
    when 'completed' then
      new.completed_at := coalesce(new.completed_at, now());
    else
      null;
  end case;

  return new;
end;
$$;

create trigger custom_orders_before_status_change
  before update of status on public.custom_orders
  for each row execute function private.custom_order_before_status_change();


create or replace function private.handle_custom_order_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.order_status_history (order_id, status, changed_by)
  values (new.id, new.status, new.customer_id);

  perform private.notify_staff(
    'New custom order',
    format('Order %s was submitted and is waiting for review.', new.order_number),
    'custom_order',
    new.id
  );
  return null;
end;
$$;

create trigger custom_orders_after_insert
  after insert on public.custom_orders
  for each row execute function private.handle_custom_order_created();


-- An optional note for the history row can be passed with
--   select set_config('app.status_note', '<note>', true);
-- in the same transaction (rpc(cancel_custom_order) does this).
create or replace function private.handle_custom_order_status_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := coalesce(auth.uid(), new.accepted_by, new.customer_id);
  v_note  text := coalesce(
    nullif(current_setting('app.status_note', true), ''),
    case when new.status = 'declined' then new.decline_reason end
  );
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
      case new.status
        when 'accepted'    then 'Order accepted'
        when 'declined'    then 'Order declined'
        when 'in_progress' then 'Order in production'
        when 'ready'       then 'Order ready for pickup'
        when 'completed'   then 'Order completed'
        when 'cancelled'   then 'Order cancelled'
        else 'Order updated'
      end,
      case new.status
        when 'accepted'  then format('Your order %s was accepted. Total: ₱%s.', new.order_number, new.total_price)
        when 'declined'  then format('Your order %s was declined: %s', new.order_number, new.decline_reason)
        when 'in_progress' then format('Your order %s is now being made.', new.order_number)
        when 'ready'     then format('Your order %s is ready for pickup.', new.order_number)
        when 'completed' then format('Your order %s is complete. Thank you!', new.order_number)
        when 'cancelled' then format('Your order %s was cancelled.%s', new.order_number, coalesce(' ' || v_note, ''))
        else format('Your order %s is now %s.', new.order_number, new.status)
      end,
      'order_status',
      new.id
    );
  end if;

  return null;
end;
$$;

create trigger custom_orders_after_status_change
  after update of status on public.custom_orders
  for each row execute function private.handle_custom_order_status_changed();


-- -----------------------------------------------------------------------------
-- Payments: reviewer stamps and notifications
-- -----------------------------------------------------------------------------

create or replace function private.payment_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status_changed boolean;
begin
  if tg_op = 'INSERT' then
    v_status_changed := true;
  else
    v_status_changed := new.status is distinct from old.status;
  end if;

  if v_status_changed then
    if new.status in ('verified', 'rejected') then
      new.verified_by := coalesce(auth.uid(), new.verified_by);
      new.verified_at := now();
    else
      new.verified_by := null;
      new.verified_at := null;
    end if;
  end if;

  return new;
end;
$$;

create trigger payments_before_write
  before insert or update on public.payments
  for each row execute function private.payment_before_write();


create or replace function private.handle_payment_written()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.custom_orders;
  v_label text := replace(new.payment_type::text, '_', ' ');
begin
  if tg_op = 'UPDATE' then
    if new.status is not distinct from old.status then
      return null;
    end if;
  end if;

  select * into v_order from public.custom_orders where id = new.order_id;

  if new.status = 'submitted' then
    perform private.notify_staff(
      'Payment submitted',
      format('A %s payment of ₱%s for order %s is waiting for verification.', v_label, new.amount, v_order.order_number),
      'payment',
      new.id
    );
  elsif new.status = 'verified' then
    insert into public.notifications (user_id, title, message, type, reference_id)
    values (
      v_order.customer_id,
      'Payment verified',
      format('Your %s payment of ₱%s for order %s was verified.', v_label, new.amount, v_order.order_number),
      'payment',
      new.id
    );
  elsif new.status = 'rejected' then
    insert into public.notifications (user_id, title, message, type, reference_id)
    values (
      v_order.customer_id,
      'Payment rejected',
      format('Your %s payment for order %s was rejected: %s', v_label, v_order.order_number, new.rejection_reason),
      'payment',
      new.id
    );
  end if;

  return null;
end;
$$;

create trigger payments_after_write
  after insert or update of status on public.payments
  for each row execute function private.handle_payment_written();


-- -----------------------------------------------------------------------------
-- Chat: notify the recipient of a direct message
-- -----------------------------------------------------------------------------

create or replace function private.handle_chat_message_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender text;
begin
  if new.receiver_id is null then
    return null;
  end if;

  select coalesce(full_name, username) into v_sender
  from public.profiles where id = new.sender_id;

  insert into public.notifications (user_id, title, message, type, reference_id)
  values (
    new.receiver_id,
    'New message from ' || v_sender,
    left(new.message, 140),
    'chat',
    -- the order thread when there is one, otherwise the conversation partner
    coalesce(new.order_id, new.sender_id)
  );
  return null;
end;
$$;

create trigger chat_messages_after_insert
  after insert on public.chat_messages
  for each row execute function private.handle_chat_message_created();


-- =============================================================================
-- 5. RPC FUNCTIONS (supabase.rpc)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- rpc('create_pos_sale', {
--   p_items: [{ variant_id, quantity }, ...],
--   p_amount_paid: 1500,
--   p_payment_method: 'cash' | 'gcash'
-- })
-- Prices come from product_variants, not the client. Atomic: either the whole
-- sale (sale, items, stock deductions, inventory log) is saved or nothing is.
-- -----------------------------------------------------------------------------

create or replace function public.create_pos_sale(
  p_items          jsonb,
  p_amount_paid    numeric,
  p_payment_method public.payment_method
)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_sale     public.sales;
  v_subtotal numeric(12, 2) := 0;
  v_item     record;
  v_variant  public.product_variants;
begin
  if v_uid is null or not public.is_staff() then
    raise exception 'Only staff or owners can record sales' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A sale needs at least one item' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where (e ->> 'variant_id') is null
       or coalesce((e ->> 'quantity')::integer, 0) <= 0
  ) then
    raise exception 'Every item needs a variant_id and a quantity above 0' using errcode = '22023';
  end if;

  -- Lock variants in a fixed order (avoids deadlocks between two registers)
  -- and check stock before writing anything.
  for v_item in
    select (e ->> 'variant_id')::uuid as variant_id, sum((e ->> 'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) e
    group by 1
    order by 1
  loop
    select * into v_variant
    from public.product_variants
    where id = v_item.variant_id
    for update;

    if not found then
      raise exception 'Product variant % not found', v_item.variant_id using errcode = 'P0002';
    end if;

    if not v_variant.is_active
       or not exists (select 1 from public.products where id = v_variant.product_id and is_active) then
      raise exception 'Variant % (%) is not available for sale', coalesce(v_variant.sku, v_variant.id::text), concat_ws(' / ', v_variant.size, v_variant.color)
        using errcode = 'P0001';
    end if;

    if v_variant.stock_quantity < v_item.quantity then
      raise exception 'Insufficient stock for %: % available, % requested',
        coalesce(v_variant.sku, v_variant.id::text), v_variant.stock_quantity, v_item.quantity
        using errcode = 'P0001';
    end if;

    v_subtotal := v_subtotal + v_variant.price * v_item.quantity;
  end loop;

  if p_amount_paid is null or p_amount_paid < v_subtotal then
    raise exception 'Amount paid (₱%) is less than the total (₱%)', coalesce(p_amount_paid, 0), v_subtotal
      using errcode = 'P0001';
  end if;

  insert into public.sales (cashier_id, subtotal, amount_paid, change_amount, payment_method)
  values (v_uid, v_subtotal, p_amount_paid, p_amount_paid - v_subtotal, p_payment_method)
  returning * into v_sale;

  for v_item in
    select (e ->> 'variant_id')::uuid as variant_id, sum((e ->> 'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) e
    group by 1
    order by 1
  loop
    insert into public.sale_items (sale_id, variant_id, quantity, unit_price)
    select v_sale.id, v.id, v_item.quantity, v.price
    from public.product_variants v
    where v.id = v_item.variant_id;

    perform private.apply_stock_change(
      v_item.variant_id, -v_item.quantity, 'sale',
      'POS sale ' || v_sale.receipt_number, v_sale.id, v_uid
    );
  end loop;

  return v_sale;
end;
$$;


-- -----------------------------------------------------------------------------
-- rpc('adjust_stock', { p_variant_id, p_transaction_type, p_quantity, p_reason, p_reference_id })
--   restock / return : p_quantity > 0, adds stock
--   damage           : p_quantity > 0, removes stock
--   adjustment       : p_quantity is a signed correction (e.g. -2 after a count)
--   sale             : not allowed here; use create_pos_sale
-- -----------------------------------------------------------------------------

create or replace function public.adjust_stock(
  p_variant_id       uuid,
  p_transaction_type public.inventory_transaction_type,
  p_quantity         integer,
  p_reason           text default null,
  p_reference_id     uuid default null
)
returns public.inventory_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_delta integer;
begin
  if v_uid is null or not public.is_staff() then
    raise exception 'Only staff or owners can adjust stock' using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity = 0 then
    raise exception 'Quantity must not be zero' using errcode = '22023';
  end if;

  case p_transaction_type
    when 'restock', 'return' then
      if p_quantity < 0 then
        raise exception 'Use a positive quantity for %', p_transaction_type using errcode = '22023';
      end if;
      v_delta := p_quantity;
    when 'damage' then
      if p_quantity < 0 then
        raise exception 'Use a positive quantity for damage' using errcode = '22023';
      end if;
      v_delta := -p_quantity;
    when 'adjustment' then
      if p_reason is null or length(trim(p_reason)) = 0 then
        raise exception 'A reason is required for stock adjustments' using errcode = '22023';
      end if;
      v_delta := p_quantity;
    when 'sale' then
      raise exception 'Record sales with create_pos_sale' using errcode = '22023';
  end case;

  return private.apply_stock_change(
    p_variant_id, v_delta, p_transaction_type, p_reason, p_reference_id, v_uid
  );
end;
$$;


-- -----------------------------------------------------------------------------
-- rpc('cancel_custom_order', { p_order_id, p_reason })
-- Customers can cancel their own order while it is pending; staff/owners can
-- cancel any order that is not finished.
-- -----------------------------------------------------------------------------

create or replace function public.cancel_custom_order(
  p_order_id uuid,
  p_reason   text default null
)
returns public.custom_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_staff boolean := public.is_staff();
  v_order public.custom_orders;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select * into v_order
  from public.custom_orders
  where id = p_order_id
  for update;

  if not found or (v_order.customer_id <> v_uid and not v_staff) then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if not v_staff and v_order.status <> 'pending' then
    raise exception 'Only pending orders can be cancelled. Please message the shop.'
      using errcode = 'P0001';
  end if;

  perform set_config('app.status_note', coalesce(p_reason, ''), true);

  update public.custom_orders
  set status = 'cancelled'
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;


-- -----------------------------------------------------------------------------
-- rpc('set_user_role', { p_user_id, p_role })   owner only
-- -----------------------------------------------------------------------------

create or replace function public.set_user_role(
  p_user_id uuid,
  p_role    public.user_role
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if not public.is_owner() then
    raise exception 'Only owners can change user roles' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  if v_profile.role = 'owner' and p_role <> 'owner'
     and (select count(*) from public.profiles where role = 'owner') <= 1 then
    raise exception 'There must be at least one owner' using errcode = 'P0001';
  end if;

  update public.profiles
  set role = p_role
  where id = p_user_id
  returning * into v_profile;

  return v_profile;
end;
$$;


-- -----------------------------------------------------------------------------
-- Function privileges
-- Postgres grants EXECUTE to PUBLIC by default; lock everything down, then
-- open only what the app calls.
-- -----------------------------------------------------------------------------

revoke execute on all functions in schema private from public, anon, authenticated;

revoke execute on function public.create_pos_sale(jsonb, numeric, public.payment_method) from public, anon;
revoke execute on function public.adjust_stock(uuid, public.inventory_transaction_type, integer, text, uuid) from public, anon;
revoke execute on function public.cancel_custom_order(uuid, text) from public, anon;
revoke execute on function public.set_user_role(uuid, public.user_role) from public, anon;

grant execute on function public.create_pos_sale(jsonb, numeric, public.payment_method) to authenticated;
grant execute on function public.adjust_stock(uuid, public.inventory_transaction_type, integer, text, uuid) to authenticated;
grant execute on function public.cancel_custom_order(uuid, text) to authenticated;
grant execute on function public.set_user_role(uuid, public.user_role) to authenticated;

-- Role helpers are evaluated inside RLS policies for both roles.
grant execute on function public.current_user_role() to anon, authenticated;
grant execute on function public.is_staff() to anon, authenticated;
grant execute on function public.is_owner() to anon, authenticated;


-- =============================================================================
-- 6. ROW LEVEL SECURITY
-- staff = 'staff' or 'owner'. The service_role key bypasses RLS.
-- =============================================================================

alter table public.profiles               enable row level security;
alter table public.products               enable row level security;
alter table public.product_images         enable row level security;
alter table public.product_tags           enable row level security;
alter table public.product_variants       enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.sales                  enable row level security;
alter table public.sale_items             enable row level security;
alter table public.ai_designs             enable row level security;
alter table public.custom_orders          enable row level security;
alter table public.custom_order_items     enable row level security;
alter table public.order_status_history   enable row level security;
alter table public.payments               enable row level security;
alter table public.chat_messages          enable row level security;
alter table public.notifications          enable row level security;


-- -----------------------------------------------------------------------------
-- profiles
-- Users see themselves; everyone signed in can see staff/owner profiles (chat
-- names); staff see everyone. Inserted by the sign-up trigger only.
-- -----------------------------------------------------------------------------

create policy "profiles: read own, staff, or all if staff"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or role in ('staff', 'owner')
    or (select public.is_staff())
  );

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));


-- -----------------------------------------------------------------------------
-- Catalog: public can browse active products; staff manage everything.
-- -----------------------------------------------------------------------------

create policy "products: read active or staff"
  on public.products for select to anon, authenticated
  using (is_active or (select public.is_staff()));

create policy "products: staff insert"
  on public.products for insert to authenticated
  with check ((select public.is_staff()) and created_by = (select auth.uid()));

create policy "products: staff update"
  on public.products for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy "products: owner delete"
  on public.products for delete to authenticated
  using ((select public.is_owner()));


create policy "product_images: read with product"
  on public.product_images for select to anon, authenticated
  using (
    (select public.is_staff())
    or exists (select 1 from public.products p where p.id = product_id and p.is_active)
  );

create policy "product_images: staff insert"
  on public.product_images for insert to authenticated
  with check ((select public.is_staff()));

create policy "product_images: staff update"
  on public.product_images for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy "product_images: staff delete"
  on public.product_images for delete to authenticated
  using ((select public.is_staff()));


create policy "product_tags: read with product"
  on public.product_tags for select to anon, authenticated
  using (
    (select public.is_staff())
    or exists (select 1 from public.products p where p.id = product_id and p.is_active)
  );

create policy "product_tags: staff insert"
  on public.product_tags for insert to authenticated
  with check ((select public.is_staff()));

create policy "product_tags: staff update"
  on public.product_tags for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy "product_tags: staff delete"
  on public.product_tags for delete to authenticated
  using ((select public.is_staff()));


create policy "product_variants: read active or staff"
  on public.product_variants for select to anon, authenticated
  using (
    (select public.is_staff())
    or (is_active and exists (select 1 from public.products p where p.id = product_id and p.is_active))
  );

create policy "product_variants: staff insert"
  on public.product_variants for insert to authenticated
  with check ((select public.is_staff()));

create policy "product_variants: staff update"
  on public.product_variants for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy "product_variants: owner delete"
  on public.product_variants for delete to authenticated
  using ((select public.is_owner()));


-- Written only by rpc(adjust_stock) / rpc(create_pos_sale) / triggers.
create policy "inventory_transactions: staff read"
  on public.inventory_transactions for select to authenticated
  using ((select public.is_staff()));


-- -----------------------------------------------------------------------------
-- Point of Sale: staff read; written only by rpc(create_pos_sale).
-- -----------------------------------------------------------------------------

create policy "sales: staff read"
  on public.sales for select to authenticated
  using ((select public.is_staff()));

create policy "sale_items: staff read"
  on public.sale_items for select to authenticated
  using ((select public.is_staff()));


-- -----------------------------------------------------------------------------
-- AI designs: customers manage their own; staff can view all.
-- -----------------------------------------------------------------------------

create policy "ai_designs: read own or staff"
  on public.ai_designs for select to authenticated
  using (customer_id = (select auth.uid()) or (select public.is_staff()));

create policy "ai_designs: insert own"
  on public.ai_designs for insert to authenticated
  with check (customer_id = (select auth.uid()));

create policy "ai_designs: update own"
  on public.ai_designs for update to authenticated
  using (customer_id = (select auth.uid()))
  with check (customer_id = (select auth.uid()));

create policy "ai_designs: delete own"
  on public.ai_designs for delete to authenticated
  using (customer_id = (select auth.uid()));


-- -----------------------------------------------------------------------------
-- Custom orders
-- Customers create orders and read their own; staff read and update all.
-- Customers cancel through rpc(cancel_custom_order).
-- -----------------------------------------------------------------------------

create policy "custom_orders: read own or staff"
  on public.custom_orders for select to authenticated
  using (customer_id = (select auth.uid()) or (select public.is_staff()));

create policy "custom_orders: customer insert own"
  on public.custom_orders for insert to authenticated
  with check (
    customer_id = (select auth.uid())
    and status = 'pending'
    and (
      ai_design_id is null
      or exists (
        select 1 from public.ai_designs d
        where d.id = ai_design_id and d.customer_id = (select auth.uid())
      )
    )
  );

create policy "custom_orders: staff update"
  on public.custom_orders for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));


create policy "custom_order_items: read own or staff"
  on public.custom_order_items for select to authenticated
  using (
    (select public.is_staff())
    or exists (
      select 1 from public.custom_orders o
      where o.id = order_id and o.customer_id = (select auth.uid())
    )
  );

create policy "custom_order_items: insert own pending or staff"
  on public.custom_order_items for insert to authenticated
  with check (
    (select public.is_staff())
    or exists (
      select 1 from public.custom_orders o
      where o.id = order_id and o.customer_id = (select auth.uid()) and o.status = 'pending'
    )
  );

create policy "custom_order_items: update own pending or staff"
  on public.custom_order_items for update to authenticated
  using (
    (select public.is_staff())
    or exists (
      select 1 from public.custom_orders o
      where o.id = order_id and o.customer_id = (select auth.uid()) and o.status = 'pending'
    )
  )
  with check (
    (select public.is_staff())
    or exists (
      select 1 from public.custom_orders o
      where o.id = order_id and o.customer_id = (select auth.uid()) and o.status = 'pending'
    )
  );

create policy "custom_order_items: delete own pending or staff"
  on public.custom_order_items for delete to authenticated
  using (
    (select public.is_staff())
    or exists (
      select 1 from public.custom_orders o
      where o.id = order_id and o.customer_id = (select auth.uid()) and o.status = 'pending'
    )
  );


-- Written only by triggers.
create policy "order_status_history: read own or staff"
  on public.order_status_history for select to authenticated
  using (
    (select public.is_staff())
    or exists (
      select 1 from public.custom_orders o
      where o.id = order_id and o.customer_id = (select auth.uid())
    )
  );


-- -----------------------------------------------------------------------------
-- Payments
-- Customers submit payments for their own active orders (pending/submitted
-- only). Staff record cash payments and verify/reject. A rejected payment is
-- kept; the customer submits a new one.
-- -----------------------------------------------------------------------------

create policy "payments: read own or staff"
  on public.payments for select to authenticated
  using (
    (select public.is_staff())
    or exists (
      select 1 from public.custom_orders o
      where o.id = order_id and o.customer_id = (select auth.uid())
    )
  );

create policy "payments: customer submit"
  on public.payments for insert to authenticated
  with check (
    status in ('pending', 'submitted')
    and rejection_reason is null
    and exists (
      select 1 from public.custom_orders o
      where o.id = order_id
        and o.customer_id = (select auth.uid())
        and o.status not in ('pending', 'declined', 'cancelled')
    )
  );

create policy "payments: staff insert"
  on public.payments for insert to authenticated
  with check ((select public.is_staff()));

create policy "payments: staff update"
  on public.payments for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));


-- -----------------------------------------------------------------------------
-- Chat
-- Customers talk to the shop: receiver is null (any staff) or a staff member,
-- optionally about one of their own orders. Staff see and send everything.
-- -----------------------------------------------------------------------------

create policy "chat_messages: read own conversations or staff"
  on public.chat_messages for select to authenticated
  using (
    sender_id = (select auth.uid())
    or receiver_id = (select auth.uid())
    or (select public.is_staff())
  );

create policy "chat_messages: send"
  on public.chat_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (
      (select public.is_staff())
      or (
        (
          receiver_id is null
          or exists (select 1 from public.profiles p where p.id = receiver_id and p.role in ('staff', 'owner'))
        )
        and (
          order_id is null
          or exists (
            select 1 from public.custom_orders o
            where o.id = order_id and o.customer_id = (select auth.uid())
          )
        )
      )
    )
  );

-- Only is_read is updatable (see column privileges).
create policy "chat_messages: recipient marks read"
  on public.chat_messages for update to authenticated
  using (
    receiver_id = (select auth.uid())
    or (receiver_id is null and (select public.is_staff()))
  )
  with check (
    receiver_id = (select auth.uid())
    or (receiver_id is null and (select public.is_staff()))
  );


-- -----------------------------------------------------------------------------
-- Notifications: created by triggers; users read, mark read, and delete theirs.
-- -----------------------------------------------------------------------------

create policy "notifications: read own"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create policy "notifications: mark own read"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "notifications: delete own"
  on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));


-- =============================================================================
-- 7. COLUMN-LEVEL PRIVILEGES
-- RLS decides which rows; these decide which columns the API may write.
-- =============================================================================

-- profiles: role changes go through rpc(set_user_role); username is immutable.
revoke insert, update on public.profiles from anon, authenticated;
grant update (email, full_name, phone, avatar_url) on public.profiles to authenticated;

-- product_variants: stock changes go through the inventory RPCs.
revoke update on public.product_variants from anon, authenticated;
grant update (size, color, sku, price, low_stock_threshold, is_active)
  on public.product_variants to authenticated;

-- Written only by RPCs / triggers.
revoke insert, update, delete on public.inventory_transactions from anon, authenticated;
revoke insert, update, delete on public.sales from anon, authenticated;
revoke insert, update, delete on public.sale_items from anon, authenticated;
revoke insert, update, delete on public.order_status_history from anon, authenticated;

-- ai_designs: only the generated image can be filled in after creation.
revoke update on public.ai_designs from anon, authenticated;
grant update (generated_image_url) on public.ai_designs to authenticated;

-- custom_orders: order number, acceptance and milestone stamps are automatic.
revoke insert, update, delete on public.custom_orders from anon, authenticated;
grant insert (customer_id, ai_design_id, description, notes) on public.custom_orders to authenticated;
grant update (ai_design_id, description, notes, total_price, status, decline_reason, finished_photo_url)
  on public.custom_orders to authenticated;
grant usage on sequence public.custom_orders_order_number_seq to authenticated;

-- payments: reviewer stamps are automatic.
revoke update, delete on public.payments from anon, authenticated;
grant update (payment_type, amount, method, status, gcash_reference, gcash_screenshot_url, rejection_reason)
  on public.payments to authenticated;

-- chat_messages / notifications: only the read flag can change.
revoke update, delete on public.chat_messages from anon, authenticated;
grant update (is_read) on public.chat_messages to authenticated;

revoke insert, update on public.notifications from anon, authenticated;
grant update (is_read) on public.notifications to authenticated;


-- =============================================================================
-- 8. STORAGE BUCKETS AND POLICIES
-- The first folder of each object path is the owner/record id (see header).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',        'avatars',        true,  2097152,  array['image/jpeg', 'image/png', 'image/webp']),
  ('product-images', 'product-images', true,  5242880,  array['image/jpeg', 'image/png', 'image/webp']),
  ('ai-designs',     'ai-designs',     false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('payment-proofs', 'payment-proofs', false, 5242880,  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('order-photos',   'order-photos',   false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;


-- avatars/{user_id}/...  (public read via public URL)
create policy "avatars: read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'avatars');

create policy "avatars: upload own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: update own"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);


-- product-images/{product_id}/...  (public read; staff write)
create policy "product-images: read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images');

create policy "product-images: staff upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.is_staff()));

create policy "product-images: staff update"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select public.is_staff()))
  with check (bucket_id = 'product-images' and (select public.is_staff()));

create policy "product-images: staff delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select public.is_staff()));


-- ai-designs/{customer_id}/...  (private: owner + staff)
create policy "ai-designs: read own or staff"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'ai-designs'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_staff()))
  );

create policy "ai-designs: upload own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'ai-designs' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "ai-designs: delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'ai-designs' and (storage.foldername(name))[1] = (select auth.uid())::text);


-- payment-proofs/{customer_id}/{order_id}/...  (private: owner + staff; proofs
-- cannot be changed or deleted by customers once uploaded)
create policy "payment-proofs: read own or staff"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_staff()))
  );

create policy "payment-proofs: upload own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.custom_orders o
      where o.id::text = (storage.foldername(name))[2]
        and o.customer_id = (select auth.uid())
    )
  );

create policy "payment-proofs: staff delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'payment-proofs' and (select public.is_staff()));


-- order-photos/{order_id}/...  (private: staff write; the order's customer reads)
create policy "order-photos: read own order or staff"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'order-photos'
    and (
      (select public.is_staff())
      or exists (
        select 1 from public.custom_orders o
        where o.id::text = (storage.foldername(name))[1]
          and o.customer_id = (select auth.uid())
      )
    )
  );

create policy "order-photos: staff upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'order-photos' and (select public.is_staff()));

create policy "order-photos: staff update"
  on storage.objects for update to authenticated
  using (bucket_id = 'order-photos' and (select public.is_staff()))
  with check (bucket_id = 'order-photos' and (select public.is_staff()));

create policy "order-photos: staff delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'order-photos' and (select public.is_staff()));


-- =============================================================================
-- 9. REALTIME
-- postgres_changes respects RLS, so subscribers only receive rows they can read.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;

alter publication supabase_realtime add table
  public.chat_messages,
  public.notifications,
  public.custom_orders,
  public.payments;
