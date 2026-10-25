-- =============================================================================
-- Real designs (D1): the owner can clear uploaded files
-- =============================================================================
-- Supabase doesn't let SQL delete stored files, so emptying a bucket goes through
-- the Storage API, which follows these policies. Before this, files a customer
-- uploaded (order references, chat photos, saved AI designs) could only be
-- deleted by that customer. The owner now reads and deletes any file in the
-- data buckets; supabase/seed/empty-storage.mjs uses this for the clean slate.
-- avatars and shop-accounts aren't included: profile photos and the shop's QR
-- codes stay. Safe to run more than once.
-- =============================================================================

drop policy if exists "owner: read data files" on storage.objects;
create policy "owner: read data files"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('ai-designs', 'chat-photos', 'order-photos', 'order-references', 'payment-proofs', 'pos-receipts', 'product-images')
    and (select public.is_owner())
  );

drop policy if exists "owner: delete data files" on storage.objects;
create policy "owner: delete data files"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('ai-designs', 'chat-photos', 'order-photos', 'order-references', 'payment-proofs', 'pos-receipts', 'product-images')
    and (select public.is_owner())
  );
