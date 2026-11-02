-- =============================================================================
-- J&J Sportswear: clean slate (one time, before the real catalog goes in)
-- =============================================================================
-- Deletes every product, POS sale, custom order, payment, chat, notification,
-- saved AI design, and all stock history, then restarts receipt and order
-- numbers at 1. Kept: accounts (profiles), the e-payment providers and the
-- shop's QR codes (payment_providers), and profile photos.
--
-- Uploaded files are separate: Supabase doesn't let SQL delete them. Run
-- `node supabase/seed/empty-storage.mjs` (after migration
-- 20261020000000_owner_storage_cleanup.sql) to empty those buckets.
--
-- Run in the Supabase SQL editor. THIS CANNOT BE UNDONE.
-- =============================================================================

begin;

-- Every table is named and nothing cascades: if a table that links to one of
-- these was missed, Postgres stops here instead of quietly emptying it too.
truncate table
  public.sale_payments,
  public.sale_items,
  public.sales,
  public.receipt_scans,
  public.payment_overrides,
  public.inventory_transactions,
  public.custom_order_refunds,
  public.custom_order_overrides,
  public.payments,
  public.custom_order_photos,
  public.custom_order_steps,
  public.order_status_history,
  public.custom_order_items,
  public.notifications,
  public.chat_messages,
  public.custom_orders,
  public.ai_designs,
  public.product_images,
  public.product_tags,
  public.product_variants,
  public.products;

-- The first real receipt is RCPT-<date>-000001 and the first order CO-<date>-00001.
alter sequence public.sales_receipt_number_seq restart with 1;
alter sequence public.custom_orders_order_number_seq restart with 1;

commit;
