-- =============================================================================
-- E-payments (E3): receipt scans and their photos
-- =============================================================================
-- Needs 20261016120000_e_payments.sql.
--
-- 1. receipt_scans logs every time the counter reads a payment receipt: who,
--    when, the provider the cashier picked, what the reader found (reference,
--    amount, date and time, status, who it was sent to, its confidence and any
--    problems it noticed), the outcome, the model, and how long it took. Retakes
--    and abandoned scans are logged too, so an old or edited receipt that was
--    tried and dropped still shows. Rows are kept; only photos expire.
--    sale_id is filled in once the payment is charged (Phase E4).
-- 2. Photos go to the private pos-receipts bucket as
--    pos-receipts/{scanned_by}/{random id}.webp. Staff and the owner read them.
--    After 90 days anyone on staff may delete one (the counter deletes a few
--    on each scan) and marks the scan's photo_deleted_at.
-- Every statement is safe to run again.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Scans
-- -----------------------------------------------------------------------------

create table if not exists public.receipt_scans (
  id               uuid primary key default gen_random_uuid(),
  scanned_by       uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  provider         text not null references public.payment_providers (code) on delete restrict,
  photo_path       text,
  photo_deleted_at timestamptz,
  outcome          text not null check (outcome in ('read', 'not_receipt', 'unreadable', 'quota', 'failed')),
  model            text check (model is null or length(model) <= 80),
  reading          jsonb,
  duration_ms      integer check (duration_ms is null or duration_ms >= 0),
  sale_id          uuid references public.sales (id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint receipt_scans_photo_deleted check (photo_deleted_at is null or photo_path is not null)
);

comment on table public.receipt_scans is 'Every payment receipt the counter read, kept for audit. Photos expire after 90 days.';
comment on column public.receipt_scans.provider is 'The provider the cashier picked before scanning.';
comment on column public.receipt_scans.reading is 'What the reader returned after the server checked it: fields, confidence, problems. No sender details.';
comment on column public.receipt_scans.sale_id is 'The sale this scan''s payment went into, once charged (Phase E4).';

create index if not exists receipt_scans_scanned_by_idx on public.receipt_scans (scanned_by, created_at desc);
create index if not exists receipt_scans_sale_id_idx on public.receipt_scans (sale_id) where sale_id is not null;
create index if not exists receipt_scans_photo_expiry_idx on public.receipt_scans (created_at)
  where photo_path is not null and photo_deleted_at is null;

alter table public.receipt_scans enable row level security;

drop policy if exists "receipt_scans: staff read" on public.receipt_scans;
create policy "receipt_scans: staff read"
  on public.receipt_scans for select to authenticated
  using ((select public.is_staff()));

-- A scan is logged by the person who made it, with their own photo.
drop policy if exists "receipt_scans: staff log own" on public.receipt_scans;
create policy "receipt_scans: staff log own"
  on public.receipt_scans for insert to authenticated
  with check (
    (select public.is_staff())
    and scanned_by = (select auth.uid())
    and (photo_path is null or split_part(photo_path, '/', 1) = (select auth.uid())::text)
  );

-- After 90 days the photo may be marked deleted; nothing else about a scan changes.
drop policy if exists "receipt_scans: mark expired photo" on public.receipt_scans;
create policy "receipt_scans: mark expired photo"
  on public.receipt_scans for update to authenticated
  using ((select public.is_staff()) and created_at < now() - interval '90 days')
  with check ((select public.is_staff()));

revoke insert, update, delete on public.receipt_scans from anon, authenticated;
grant insert (provider, photo_path, outcome, model, reading, duration_ms) on public.receipt_scans to authenticated;
grant update (photo_deleted_at) on public.receipt_scans to authenticated;


-- -----------------------------------------------------------------------------
-- 2. Photos
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('pos-receipts', 'pos-receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "pos-receipts: staff read" on storage.objects;
create policy "pos-receipts: staff read"
  on storage.objects for select to authenticated
  using (bucket_id = 'pos-receipts' and (select public.is_staff()));

drop policy if exists "pos-receipts: staff upload own" on storage.objects;
create policy "pos-receipts: staff upload own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pos-receipts'
    and (select public.is_staff())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "pos-receipts: delete after 90 days" on storage.objects;
create policy "pos-receipts: delete after 90 days"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'pos-receipts'
    and (select public.is_staff())
    and created_at < now() - interval '90 days'
  );
