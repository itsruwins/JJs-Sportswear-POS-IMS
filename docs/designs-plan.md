# Real designs plan

One phase per session. Each phase ends finished and tested, and the next one starts only after you approve it. Every phase starts with its own questions.

Goal: the 76 full-sublimation jersey designs from the shop's Google Drive replace the sample catalog. Staff take orders for them at the POS, the online shop shows them as a gallery, and every piece of sample and test data is gone.

Source files:
- Designs: Google Drive folder "DESIGNS" (DESIGN 1–77, each with a full design plus upper and lower front, side, and back views).
- Labelled list: `../Files/JJs Sportswear Design List.xlsx` (team name, colors, prices; four names flagged for checking).
- Prices: `../Files/` handwritten "Full Sublimation PRICES" list.
- Cut reference: `../Files/Cut.jpeg`.

## Decisions (2026-10-24)

- **What they are:** every design is a Jersey sold as a set (upper and shorts) or as the upper only. None are reversible. DESIGN 59 is an empty folder and is skipped. DESIGN 3 uses its upper front as the photo.
- **Cut:** chosen per order. All mockups use one NBA-style template, so the pictures don't show the cut.
- **Product shape:** one product per design. Variants are style × size, and the style goes in the existing `color` field: NBA cut · Set ₱680, Normal cut · Set ₱650, NBA cut · Upper ₱350, Normal cut · Upper ₱325. Where a made-to-order product shows that field, it reads "Style", not "Color".
- **Sizes:** adult XS–5XL with no 2XL-and-up upcharge. That's 36 variants per design.
- **Stock:** made to order, with no stock limit. Designs aren't counted or blocked by stock.
- **POS:** selling a design creates a custom order, not a counter sale. The cashier enters a walk-in name and phone (no account needed), and collects the 50% down payment or the full amount, in cash or e-payment. The balance is collected at pickup, as the database already enforces.
- **Online shop:** a gallery with prices only. Customers can't order designs online or through chat.
- **Photos:** compressed from each full design and stored in the `product-images` bucket. `.env.local` has no server key, so the upload runs as the owner's login.
- **Wipe:** everything goes. That covers sample products, POS sales and their payments, receipt scans, stock history, custom orders with their items, steps, photos, payments, refunds and overrides, chats, notifications, saved AI designs, and uploaded files. Accounts stay.
- **Sample drawings:** all 16 in `public/samples` are deleted, along with the code that recolors them. Until a FLUX key is set, the AI design studio shows a plain placeholder.
- **Landing page:** its sample timeline and stock standings stay. They weren't part of this request.

## Phases

### Phase D1: Clean slate
- A one-time wipe script in `supabase/seed/` for every table listed under Wipe, in an order the foreign keys allow, inside one transaction.
- Uploaded files: Supabase doesn't allow deleting stored files with plain SQL, so this is a small script run as the owner, or emptying the buckets in the dashboard. Decided in the phase questions.
- Remove `public/samples/`, `features/customer/design/sample-art.ts`, the shop's sample flags and notes, and the studio's sample previews (it gets a placeholder). Remove the `sample-*.sql` and `remove-sample-*.sql` seeds.
- **Done when:** the admin, POS, shop, Payments, Orders, Chat and Sales pages all load empty without errors, and the studio shows its placeholder.
- **Decisions (2026-10-24):** files go through a script run as the owner. Avatars stay, both the files and the links. Receipt and order numbers restart at 1. No backup.
- **Built 2026-10-24:**
  - Migration `20261020000000_owner_storage_cleanup.sql` lets the owner read and delete any file in the 7 data buckets (ai-designs, chat-photos, order-photos, order-references, payment-proofs, pos-receipts, product-images). Avatars and shop-accounts aren't included.
  - `supabase/seed/wipe-all-data.sql` truncates the 21 data tables, naming each one with no cascade, and restarts both number sequences. Kept: `profiles` and `payment_providers`.
  - `supabase/seed/empty-storage.mjs` (`node supabase/seed/empty-storage.mjs`) signs in as the owner, counts the files per bucket, deletes only after you type DELETE, then counts again.
  - Removed `public/samples/`, `sample-art.ts`, `preview-art.ts`, the fonts in `assets/fonts/`, `types/opentype.d.ts`, the `opentype.js` package, every `sample-*.sql` and `remove-*.sql` seed, and the hidden "sample" tag handling in the admin, POS, catalog and shop.
  - Studio: without `BFL_API_KEY` the Generate button reads "Coming soon", the stage shows the picked colors, and the server action refuses to generate.
  - Tested in PGlite against every migration in order, 18 checks: data in every area, the wipe, kept tables, every public table either wiped or deliberately kept, numbering restarting, the owner deleting data files but not avatars or QR codes, a customer still blocked, and the migration re-running.

### Phase D2: Made-to-order products
- Migration: a `made_to_order` flag on products. Stock stays at 0, and nothing that reads stock treats these products as sold out or low.
- Admin product form: a Made to order switch that hides stock fields and relabels Color as Style. The stock page and low-stock alerts skip these products.
- **Done when:** a made-to-order product can be created and edited by hand and never appears as sold out or low stock.

### Phase D3: Load the 76 designs
- Compress the 76 full designs and upload them to `product-images` as the owner.
- A load script for the products, primary photo, tags, and 36 variants each, with SKUs and prices from the list. Confirm the four uncertain team names first.
- **Done when:** the admin lists 76 designs with photos, styles, sizes and prices matching the price list.

### Phase D4: POS design orders
- Designed with `/impeccable` and `/apple-design`, approved before it's built.
- Migration: custom orders without an account take a walk-in name and phone. A database function creates the accepted order with its items and total, and records the down or full payment in one step (cash and the e-payment providers from E5).
- POS: pick a design, then a style, size and quantity, then enter the walk-in details and take the payment. The order then appears in Orders and Payments like any custom order.
- **Done when:** a counter order with a 50% down payment and one paid in full both appear correctly in Orders, Payments and the order timeline, and a payment under 50% is refused.

### Phase D5: Shop gallery
- The shop shows the designs with a photo, team name, style prices and sizes, with no order button on made-to-order products. It says orders are taken at the shop counter.
- **Done when:** customers can browse and filter the designs, and nothing in the shop or chat creates an order for one.
