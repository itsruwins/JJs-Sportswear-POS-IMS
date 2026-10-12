-- =============================================================================
-- E-payments (E5): custom-order payments through any provider
-- =============================================================================
-- Needs 20261018000000_e_payment_checks.sql.
--
-- 1. Each provider can take custom-order payments online once the owner turns it
--    on, with the shop's account name, number, and an optional QR image (public
--    bucket shop-accounts, owner uploads). GCash starts on, as before.
-- 2. Custom-order payments carry a provider and a reference, like counter
--    e-payments: method 'e_payment'. GCash payments so far become e_payment ·
--    GCash; gcash_reference stays for history. References follow the provider's
--    rule and are cleaned the same way (upper case, no spaces or dashes).
-- 3. One transfer pays for one thing: a reference on a standing counter sale
--    can't be sent for an order, and one on an order payment that isn't
--    rejected can't be taken at the counter.
-- 4. Customers send e-payments through a provider that takes them online. Staff
--    record cash or e-payments (rpc record_custom_order_payment, new arguments)
--    and verify e-payments that carry a reference.
-- 5. receipt_scans can hold the reader's look at a customer's screenshot
--    (payment_id), for staff. Such a scan can never pay for a counter sale.
-- Refunds keep their own cash/GCash method and are unchanged.
-- Every statement is safe to run again.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Online payments and the shop's accounts
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payment_providers' and column_name = 'accepts_online'
  ) then
    alter table public.payment_providers add column accepts_online boolean not null default false;
    -- Only the first time: GCash took custom-order payments before; the owner can switch it off later.
    update public.payment_providers set accepts_online = true where code = 'gcash';
  end if;
end;
$$;

alter table public.payment_providers
  add column if not exists account_name   text check (account_name is null or length(btrim(account_name)) between 1 and 80),
  add column if not exists account_number text check (account_number is null or length(btrim(account_number)) between 1 and 40),
  add column if not exists qr_path        text check (qr_path is null or qr_path ~ '^[a-z][a-z0-9_]{1,31}/[0-9a-f-]{36}\.(png|jpg|webp)$');

comment on column public.payment_providers.accepts_online is 'Customers can pay custom orders through this provider.';
comment on column public.payment_providers.account_name is 'The shop''s account name customers send to (null: to follow).';
comment on column public.payment_providers.qr_path is 'The shop''s QR code in the public shop-accounts bucket: {provider}/{uuid}.ext';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('shop-accounts', 'shop-accounts', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "shop-accounts: owner upload" on storage.objects;
create policy "shop-accounts: owner upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'shop-accounts' and (select public.is_owner()));

drop policy if exists "shop-accounts: owner update" on storage.objects;
create policy "shop-accounts: owner update"
  on storage.objects for update to authenticated
  using (bucket_id = 'shop-accounts' and (select public.is_owner()))
  with check (bucket_id = 'shop-accounts' and (select public.is_owner()));

drop policy if exists "shop-accounts: owner delete" on storage.objects;
create policy "shop-accounts: owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'shop-accounts' and (select public.is_owner()));


-- -----------------------------------------------------------------------------
-- 2. Provider and reference on custom-order payments
-- -----------------------------------------------------------------------------

alter table public.payments
  add column if not exists provider  text references public.payment_providers (code) on delete restrict,
  add column if not exists reference text;

comment on column public.payments.provider is 'E-payments: the e-wallet or bank it was sent through.';
comment on column public.payments.reference is 'E-payments: the cleaned reference (upper case, no spaces or dashes). Text, so leading zeros stay.';
comment on column public.payments.gcash_reference is 'History only: GCash references from before providers. New payments use reference.';

alter table public.payments drop constraint if exists payments_method_supported;

update public.payments
set method = 'e_payment', provider = 'gcash', reference = gcash_reference
where method = 'gcash';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_method_supported') then
    alter table public.payments add constraint payments_method_supported check (method in ('cash', 'e_payment'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_provider_shape') then
    alter table public.payments add constraint payments_provider_shape check (
      (method = 'cash' and provider is null and reference is null)
      or (method = 'e_payment' and provider is not null)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_e_payment_proof_required') then
    alter table public.payments add constraint payments_e_payment_proof_required check (
      method <> 'e_payment' or status = 'pending' or reference is not null or gcash_screenshot_url is not null
    );
  end if;
end;
$$;

create unique index if not exists payments_reference_live_key
  on public.payments (provider, reference)
  where reference is not null and status <> 'rejected';


-- -----------------------------------------------------------------------------
-- 2–3. Before a payment is written: tidy and check the reference, and make sure
--      the same transfer isn't on a counter sale. Security definer, so a
--      customer's payment is checked against sales they can't read.
-- -----------------------------------------------------------------------------

create or replace function private.payment_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status_changed boolean;
  v_provider       public.payment_providers;
  v_taken          text;
begin
  new.gcash_reference := nullif(regexp_replace(coalesce(new.gcash_reference, ''), '[^0-9]', '', 'g'), '');

  if new.method = 'e_payment' then
    new.reference := nullif(upper(regexp_replace(coalesce(new.reference, ''), '[\s-]', '', 'g')), '');
    if new.reference is not null
       and (tg_op = 'INSERT' or new.reference is distinct from old.reference or new.provider is distinct from old.provider) then
      select * into v_provider from public.payment_providers where code = new.provider;
      if not found then
        raise exception 'That provider isn''t accepted' using errcode = '22023', detail = 'payment:provider';
      end if;
      if new.reference !~ v_provider.reference_pattern then
        raise exception 'The % reference number doesn''t look right', v_provider.name using errcode = '22023', detail = 'payment:reference';
      end if;
      -- One transfer pays for one thing. The lock is shared with counter sales.
      perform pg_advisory_xact_lock(hashtext('e_payment:' || new.provider || ':' || new.reference));
      select s.receipt_number into v_taken
      from public.sale_payments sp
      join public.sales s on s.id = sp.sale_id
      where sp.provider = new.provider and sp.reference = new.reference and sp.voided_at is null
      limit 1;
      if v_taken is not null then
        raise exception 'That reference was already used at the counter (%)', v_taken
          using errcode = '23505', detail = 'payment:duplicate:' || v_taken;
      end if;
    end if;
  else
    new.provider := null;
    new.reference := null;
  end if;

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

-- The counter's side of the same rule.
create or replace function private.sale_payment_not_on_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order text;
begin
  if new.method <> 'e_payment' or new.reference is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('e_payment:' || new.provider || ':' || new.reference));
  select o.order_number into v_order
  from public.payments p
  join public.custom_orders o on o.id = p.order_id
  where p.provider = new.provider and p.reference = new.reference and p.status <> 'rejected'
  limit 1;
  if v_order is not null then
    raise exception 'That reference was already sent for order %', v_order
      using errcode = '23505', detail = 'payment:' || new.position || ':duplicate:' || v_order;
  end if;
  return new;
end;
$$;

drop trigger if exists sale_payments_not_on_order on public.sale_payments;
create trigger sale_payments_not_on_order
  before insert on public.sale_payments
  for each row execute function private.sale_payment_not_on_order();


-- -----------------------------------------------------------------------------
-- 4. Customers send e-payments through a provider that takes them online
-- -----------------------------------------------------------------------------

drop policy if exists "payments: customer submit" on public.payments;
create policy "payments: customer submit"
  on public.payments for insert to authenticated
  with check (
    status = 'submitted'
    and method = 'e_payment'
    and reference is not null
    and gcash_reference is null
    and rejection_reason is null
    and exists (select 1 from public.payment_providers p where p.code = provider and p.is_active and p.accepts_online)
    and exists (
      select 1 from public.custom_orders o
      where o.id = order_id
        and o.customer_id = (select auth.uid())
        and o.status in ('accepted', 'in_progress', 'ready', 'completed')
    )
  );

revoke insert, update, delete on public.payments from anon, authenticated;
grant insert (order_id, payment_type, amount, method, status, provider, reference, gcash_screenshot_url)
  on public.payments to authenticated;


-- -----------------------------------------------------------------------------
-- 4. rpc('record_custom_order_payment', { p_order_id, p_amount, p_method, p_provider, p_reference, p_proof_path, p_note })
--   Staff record money received: cash, or an e-payment with its provider and reference.
-- -----------------------------------------------------------------------------

drop function if exists public.record_custom_order_payment(uuid, numeric, public.payment_method, text, text, text);

create or replace function public.record_custom_order_payment(
  p_order_id   uuid,
  p_amount     numeric,
  p_method     public.payment_method,
  p_provider   text default null,
  p_reference  text default null,
  p_proof_path text default null,
  p_note       text default null
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_order   public.custom_orders;
  v_paid    numeric;
  v_amount  numeric(12, 2) := round(coalesce(p_amount, 0), 2);
  v_payment public.payments;
begin
  if v_uid is null or not public.is_staff() then
    raise exception 'Only staff can record payments' using errcode = '42501';
  end if;
  if p_method not in ('cash', 'e_payment') then
    raise exception 'Record cash or an e-payment' using errcode = '22023';
  end if;

  select * into v_order from public.custom_orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.status not in ('accepted', 'in_progress', 'ready', 'completed') then
    raise exception 'Payments are recorded on accepted orders until they''re paid in full' using errcode = 'P0001';
  end if;
  if v_amount <= 0 then
    raise exception 'Enter the amount received' using errcode = '22023';
  end if;

  v_paid := private.order_paid(p_order_id);
  if v_paid + v_amount > v_order.total_price then
    raise exception 'That''s more than the ₱% still due', v_order.total_price - v_paid using errcode = 'P0001';
  end if;

  if p_method = 'e_payment' then
    if not exists (select 1 from public.payment_providers where code = p_provider and is_active) then
      raise exception 'That provider isn''t accepted' using errcode = '22023', detail = 'payment:provider';
    end if;
    if nullif(btrim(coalesce(p_reference, '')), '') is null then
      raise exception 'An e-payment needs its reference number' using errcode = '22023', detail = 'payment:reference';
    end if;
  end if;
  if p_proof_path is not null and p_proof_path not like v_order.customer_id::text || '/' || p_order_id::text || '/%' then
    raise exception 'That screenshot isn''t in this order''s folder' using errcode = '22023';
  end if;

  -- The reference's rule and the one-transfer rule are checked as the row is written.
  insert into public.payments (order_id, payment_type, amount, method, status, provider, reference, gcash_screenshot_url, note)
  values (
    p_order_id,
    (case when v_paid < ceil(v_order.total_price / 2) then 'down_payment' else 'balance' end)::public.payment_type,
    v_amount, p_method, 'verified',
    case when p_method = 'e_payment' then p_provider end,
    case when p_method = 'e_payment' then p_reference end,
    case when p_method = 'e_payment' then p_proof_path end,
    nullif(left(btrim(coalesce(p_note, '')), 300), '')
  )
  returning * into v_payment;

  return v_payment;
end;
$$;

revoke execute on function public.record_custom_order_payment(uuid, numeric, public.payment_method, text, text, text, text) from public, anon;
grant execute on function public.record_custom_order_payment(uuid, numeric, public.payment_method, text, text, text, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 4. rpc('verify_payment', { p_payment_id }): a submitted e-payment with its reference
--   Same as 20261010120000_custom_order_payment_fixes.sql otherwise.
-- -----------------------------------------------------------------------------

create or replace function public.verify_payment(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_order   public.custom_orders;
  v_paid    numeric;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Only staff can verify payments' using errcode = '42501';
  end if;

  select * into v_payment from public.payments where id = p_payment_id;
  if not found then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  -- Lock the order first (the same order every payment function uses), then the payment.
  select * into v_order from public.custom_orders where id = v_payment.order_id for update;
  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.status not in ('pending', 'submitted') then
    raise exception 'This payment was already %', v_payment.status using errcode = 'P0001';
  end if;
  if v_payment.status <> 'submitted' or v_payment.method <> 'e_payment' or v_payment.reference is null then
    raise exception 'Only a submitted e-payment with its reference can be verified' using errcode = 'P0001';
  end if;
  if v_order.status in ('pending', 'declined') then
    raise exception 'Order % is % and can''t take payments', v_order.order_number, v_order.status using errcode = 'P0001';
  end if;
  v_paid := private.order_paid(v_order.id);
  if v_paid + v_payment.amount > v_order.total_price then
    raise exception 'That''s more than the ₱% still due', v_order.total_price - v_paid using errcode = 'P0001';
  end if;

  update public.payments
  set status = 'verified',
      payment_type = case when v_paid < ceil(v_order.total_price / 2) then 'down_payment'::public.payment_type else 'balance'::public.payment_type end
  where id = p_payment_id
  returning * into v_payment;
  return v_payment;
end;
$$;


-- -----------------------------------------------------------------------------
-- 5. The reader's look at a customer's screenshot, for staff
-- -----------------------------------------------------------------------------

alter table public.receipt_scans
  add column if not exists payment_id uuid references public.payments (id) on delete cascade;

comment on column public.receipt_scans.payment_id is 'A customer''s custom-order payment whose screenshot was read (for staff). Never a counter sale''s.';

create index if not exists receipt_scans_payment_id_idx on public.receipt_scans (payment_id, created_at desc) where payment_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'receipt_scans_payment_or_sale') then
    alter table public.receipt_scans add constraint receipt_scans_payment_or_sale check (payment_id is null or sale_id is null);
  end if;
end;
$$;

grant insert (provider, photo_path, outcome, model, reading, duration_ms, payment_id) on public.receipt_scans to authenticated;
