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
- **Decisions (2026-10-25):** the POS and the shop hide made-to-order products until D4 and D5. One price per style, for every size. The four jersey styles are one-tap chips that fill in the list price. Switching on is only allowed while stock is 0. The Stock page lists them in their own group with no counts.
- **Built 2026-10-25:**
  - Migration `20261021000000_made_to_order.sql`: a `products.made_to_order` column (default false). A trigger keeps every variant of a made-to-order product at 0 stock, covering opening stock, `adjust_stock` and returns. Another refuses switching on while any variant holds stock, and names how many pieces.
  - `features/shared/catalog/styles.ts`: the four jersey styles with their list prices and SKU codes (NBS, NMS, NBU, NMU).
  - Catalog and stock reads carry the flag, and fall back to the old read when the column isn't there yet. `productStock` gives a made-to-order product no stock, low or sold-out counts. Stock rows leave these products out, so Home, Needs restock, the reports and the CSVs skip them.
  - Product form:
    - A Made to order switch (the shop's switch as `role="switch"`) at the top of the sizes section. While stock is on the shelf it's disabled, with the count.
    - When on: Styles replaces Colors, with chips that add a style at its list price (plus "Add all"), and a Price per style list replaces base price, upcharge and alert level.
    - Opening stock is hidden, and Variant details drops Alert at.
    - Editing derives each style's price from its most common size price, and keeps sizes priced apart.
  - Product page: a Made to order pill, Styles, Sizes and Variants figures, a "Prices by size and style" grid, no Adjust stock and no stock history.
  - Products list: a pill, "N styles", and the size range instead of the stock rail. Low and sold-out filters skip these products.
  - Stock page: a collapsed "Made to order" group with Show/Hide. A search opens it, and it has no Adjust.
  - Hidden from the POS grid and the customer shop, including direct product links.
  - Tested in PGlite, 14 checks: the column default, creating one, refused opening stock and restock, prices still editable, switching blocked with stock and allowed at 0, no restock after switching, switching back off, a counter sale refused, no low-stock alert, and the migration re-running.
  - Checked in headless Chrome against a temporary preview page (deleted afterwards): desktop, phone (390px, inside a frame) and light mode. The design detector reported only advisory font-size notes, on sizes the admin already uses.

### Phase D3: Load the 76 designs
- Compress the 76 full designs and upload them to `product-images` as the owner.
- A load script for the products, primary photo, tags, and 36 variants each, with SKUs and prices from the list. Confirm the four uncertain team names first.
- **Done when:** the admin lists 76 designs with photos, styles, sizes and prices matching the price list.
- **Decisions (2026-10-25):**
  - Names are the team name only. Repeats get their design number: ARCHANGEL (2) and (75), BUYO (4) and (43), 3x3 OCEANVIEW PIRATES (31) and (32).
  - The four uncertain names (D39 JRES, D50 MIZTA FIVE, D53 BHOOOWHOOP, D54 BRDN GF) are used as read.
  - Each design gets 6 photos: the full design (main) plus upper front, back and side, and lower front and back.
  - Tags: jersey, basketball, sublimation, plus the design's colors. Each gets a generated one-line description.
  - Photos are committed in the repo. The load was run with the owner's login after the owner approved the counts.
- **Built and loaded 2026-10-25:**
  - DESIGN 59 had been filled in on Drive since the first look (CRUZADA, black, purple and gold), so **77 designs** loaded, not 76.
  - `supabase/seed/designs.json`: each design's number, fixed product id, name, description, tags and photo list, plus the styles and sizes. `supabase/seed/design-photos/D01…D77/`: 462 WebP files at 1800px with transparency kept, about 92 MB in all.
  - DESIGN 3 has no full design, so its photos are the upper and lower front, back and side, with the upper front as main. DESIGN 1's differently named files (FRONT UPPER, FRONT BACK, FRONT SIDE) map to the upper views.
  - `supabase/seed/load-designs.mjs` (`node supabase/seed/load-designs.mjs`): signs in as the owner and checks for SKU clashes. It shows the counts, writes only after LOAD, and adds only what's missing, so admin edits survive a re-run. A product stays hidden until its load finishes, and a run that stopped halfway finishes and shows it.
  - `supabase/seed/owner-session.mjs` holds the shared owner sign-in, which `empty-storage.mjs` now uses too.
  - SKUs follow `D{nn}-{style}-{size}`, e.g. D01-NBS-M (NBS, NMS, NBU, NMU). Base price is ₱325, the lowest style.
  - The first run stopped once, at design 76, on a storage upload with no error text. The re-run finished it.
  - Verified in the live database: 77 active made-to-order products, 462 photos with one main photo each, 2,772 variants all at 0 stock, 419 tags, no incomplete designs, photos served publicly as WebP, and a final run with nothing left to add.

### Phase D4: POS design orders
- Designed with `/impeccable` and `/apple-design`, approved before it's built.
- Migration: custom orders without an account take a walk-in name and phone. A database function creates the accepted order with its items and total, and records the down or full payment in one step (cash and the e-payment providers from E5).
- POS: pick a design, then a style, size and quantity, then enter the walk-in details and take the payment. The order then appears in Orders and Payments like any custom order.
- **Done when:** a counter order with a 50% down payment and one paid in full both appear correctly in Orders, Payments and the order timeline, and a payment under 50% is refused.
- **Decisions (2026-10-25):**
  - Separate checkouts: shelf items stay a normal sale, and a design order is its own step.
  - Team name, needed-by date and a notes box for the player list. No per-piece roster.
  - Walk-in name and phone only, never linked to an account. The order starts as Accepted.
  - Pay anything from 50% to full, with the same e-payment flow as sales (provider, receipt scan, reference).
  - A printable order slip. Staff and the owner can both take orders.
  - Layout A: Shelf | Designs tabs, with several designs per order.
- **Built 2026-10-25:**
  - Migration `20261022000000_counter_design_orders.sql`:
    - Custom orders can have no account, but then need `walk_in_name` and `walk_in_phone`. A `created_via` column says customer or counter, and a `counter_request_id` unique key makes a retried order safe.
    - Order lines get `product_id`, `variant_id` and `unit_price`. Payments get `receipt_scan_id`.
    - A notification with no recipient is skipped by one trigger, so every existing order, payment and refund trigger works for walk-ins unchanged. The order-created trigger records the cashier, and staff aren't asked to review their own order.
    - `create_counter_order(items, buyer, details, payments, request_id)`: staff only, prices from the catalog, made-to-order designs only. It checks between half and the full total, up to 10 payment parts with at most one cash, then creates the order and accepts it. Each part goes through `record_custom_order_payment`, so the existing reference rules apply.
  - `features/admin/design-orders/`:
    - `model.ts` (lines, totals, half down, phone check) and `data.ts` (`designsFrom` catalog products, `fetchCounterOrder` for the slip).
    - `actions.ts` (`placeCounterOrder`, which turns database refusals into plain messages).
    - `components/`: the Designs screen, its parts (step strip with lamps, design tiles, a style × size pieces editor, order summary) and the order slip.
  - POS: the header has Shelf | Designs tabs (`?tab=designs`).
  - The Designs tab:
    - A photo grid, searchable by team name, design number or color. Tiles show their piece count.
    - Pieces: one block per style, with typed size cells.
    - The green "N pieces · ₱X  Review order" bar, then Buyer (name, phone, team, needed-by, notes, checked inline), then Payment.
    - Payment has Half and Full chips or a typed amount, plus the POS payment panel and receipt-scan sheet: cash with change, e-payments, splits. It shows paid now and the balance at pickup, and "Place order · ₱X" says why when it can't run.
    - The order in progress is kept in this tab (sessionStorage).
  - `/admin/pos/orders/[id]`: the order slip on the receipt's paper (80 mm or A4), with Print slip, New design order and Open the order.
  - Orders and Payments show walk-ins as "Name (walk-in)" with their phone. The order page lets you record the balance for a walk-in (screenshots go in `walk-in/{order}/…`), says "Call … to pick it up" when ready, and links the slip. Chat stays account-only. "The customer has been told" only appears when there's an account.
  - Tested in PGlite against every migration, 31 checks:
    - Refused: under half, over the total, a stocked item, a missing phone, a customer placing one.
    - Correct: walk-in details, merged lines at catalog prices, a verified down payment, history by the cashier, no review notice, no stray notifications, retry safety.
    - Lifecycle: production, ready, balance before pickup and completion, GCash with a reference, a reused reference refused, a reference required, nothing left behind on failure, splits, two cash parts refused, cancel and refund.
    - Online orders still go in, notify staff, and tell the customer.
  - Clicked through in headless Chrome (puppeteer-core) on a temporary preview page with the live catalog (deleted afterwards): designs, pieces, buyer errors, payment and cash short, on desktop light and phone dark, plus the slip. No page errors. One fix: the size cell showed a double focus ring.
  - Not done: placing a real order with the owner's login, and the cancel and reopen dialogs' "the customer is told" wording for walk-ins (`order-actions.tsx`).

### Phase D5: Shop gallery
- The shop shows the designs with a photo, team name, style prices and sizes, with no order button on made-to-order products. It says orders are taken at the shop counter.
- **Done when:** customers can browse and filter the designs, and nothing in the shop or chat creates an order for one.
