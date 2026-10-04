# Admin build plan (inventory first)

One phase per session. Each phase ends finished, reviewed, and demoable before the next starts.

## Decisions so far

- **Scope:** inventory first, then POS, custom orders, payments, and reports in later phases, all in one admin.
- **Devices:** desktop, tablet, and phone. Desktop gets dense tables, tablet gets touch-sized controls, phone gets quick stock checks and changes.
- **Look:** the landing page's world (court green, Archivo, flip-card numerals), calmer for all-day use. Screens are mostly neutral; green and amber appear only where they carry meaning (live status, low stock).
- **Roles:** staff manage products, stock, and sales. Only the owner deletes, manages staff and roles, and sees sales reports.
- **Sizes:** picked from one standard list. The exact list is confirmed in Phase 3.
- **Barcodes:** none. Search by name, SKU, tag, size, or color.
- **Data:** realistic sample data first, real shop data later.

## Already enforced by the database (supabase/migrations)

- **Product and variant permissions:** staff can create and edit products and variants. Only the owner can delete them.
- **Stock changes:** stock only changes through `rpc('adjust_stock')` or `rpc('create_pos_sale')`, and every change is logged in `inventory_transactions`.
- **Automatic triggers:** opening stock on a new variant is logged as a restock, and low-stock notifications to staff fire on their own.
- **Product photos:** the `product-images` bucket is public to read, and only staff can upload to it.
- **Roles:** new accounts are customers. The first owner is set once in SQL, and after that owners assign roles with `rpc('set_user_role')`.

## Inventory phases

### Phase 1: Admin foundation
- Session handling for server pages (Next 16 `proxy.ts`) and a server Supabase client.
- `/admin` only for staff and owners. Customers and visitors are redirected.
- After logging in, staff and owners land in the admin.
- Admin shell:
  - Navigation: sidebar on desktop, compact rail on tablet, bottom tabs on phone.
  - Account menu and sign out.
  - Role-aware menu items.
- Empty states for sections that come later.
- **Done when:** the owner logs in, reaches the admin on all three device sizes, and a customer can't get in.

### Phase 2: Sample data + product list
- A seed script with realistic sample products, variants, tags, and placeholder images, labeled as samples.
- Products list:
  - Search by name, SKU, tag, size, or color.
  - Filters for active, archived, low stock, and out of stock.
  - Stock per size at a glance, using the landing page's stock rail.
  - Table layout on desktop, rows on phone.
- **Done when:** staff can find any sample product in seconds and see its stock by size.

### Phase 3: Add and edit products
- The product form:
  - Fields for name, description, base price, and tags.
  - Photo uploads with a primary photo.
  - Pick sizes from the standard list and add colors, which builds the variant grid.
  - In the grid, set SKU (auto-suggested), price, low-stock threshold, and opening stock for each variant.
- Archive and unarchive products. Only the owner can delete.
- **Done when:** a new product with sizes and colors can be created and edited without touching SQL.

### Phase 4: Stock adjustments
- Restock, correct the count, record damage, or record a return for one variant or several sizes at once.
- Every change needs a reason and goes through `adjust_stock`.
- Clear confirmation of each change and recovery when it fails.
- **Done when:** every stock change is one or two taps and shows up in the log.

### Phase 5: Stock history + low-stock alerts
- An inventory log filterable by type, product, staff member, and date, plus each variant's own history.
- A low-stock and out-of-stock list.
- A live notifications bell.
- Add `products` and `product_variants` to the `supabase_realtime` publication (a new migration), so the admin's counts update the moment stock moves. Phase 1 refreshes them on tab focus and every minute instead.
- **Done when:** staff can answer "who changed this, when, and why" and see what needs restocking.
- **Built (2026-10-04):** `/admin/history` (filters in the URL: Today / 7 days / 30 days / All time / custom dates in Manila time, kind, product, staff; changes and pieces in/out totals; grouped by day; "Show more" in steps of 50), a "Stock history" section on each product page, and "See all history" from Stock. The notification bell shows unread count, list, mark read on tap, and mark all read, with brief pop-ups for new alerts. Low-stock alerts open the product. Realtime migration `20261005000000_realtime_stock.sql` adds products, product_variants, and inventory_transactions to the publication; pages refresh when stock moves, and the focus/one-minute refresh remains the fallback. The low-stock list is Home's "Needs restock" plus the Stock page's filter.

### Phase 6: Inventory dashboard + report
- An overview: low and out-of-stock counts, recent movements, and stock value.
- An inventory report that can be printed or exported to CSV.
- **Done when:** the owner gets the inventory picture on one screen and can print or export it.
- **Built (2026-10-04):** Home is the dashboard. It shows pieces on hand, stock value (owner only, at selling price), pieces in and out over the last 7 days, Needs restock, and Recent changes. `/admin/reports` (owner only, in the More menu) has a summary, Needs restock, Stock movement for a chosen period (Today / 7 / 30 / All time / custom), and Stock on hand grouped by product. Each section downloads as CSV, and "Print report" gives a clean A4 printout. History has an owner-only CSV download of its current filters. There's no cost price yet, so profit and margin wait for a future cost-price column.

## Later phases (planned in detail when we reach them)

7. **Staff and roles:** the owner promotes accounts to staff (`set_user_role`).
   - **Built (2026-10-04):** `/admin/staff` (owner only, in the More menu). Team lists every owner and staff member with role, contact, joined date, last stock change, and a link to their History. Staff can be made owner or removed from staff, other owners can be changed to staff, and the owner's own row can't be changed (another owner can). Add staff searches customer accounts by username, name, email, or phone. Every change asks first; making someone an owner needs their username typed. Removed staff lose access on their next page or action. The database still refuses to remove the last owner. History keeps a former staff member in its staff filter, marked "(former staff)", so their history link still works. Migration `20261006000000_safe_role_changes.sql` makes role changes run one at a time, so two owners can't remove each other at once and leave the shop with none. It also re-checks the role the owner saw under the row lock. The screen works before this migration is run, but without those two protections.
8. **Point of sale:** sales at the counter, cash or GCash, change, receipts (`create_pos_sale`).
   - **Built (2026-10-04):**
     - **`/admin/pos`** (staff and owner, in the More menu):
       - Find an item by name, SKU, size, or color, then tap a size in its color × size grid. Each cell shows what's left after the current sale; sold-out sizes can't be tapped.
       - The sale lists items with quantities, the total, and Cash or GCash. Cash has Exact and quick amounts and shows the change. GCash needs the 13-digit reference.
       - Layout: side by side on desktop; on phones and tablets the sale is a second step behind a "Review sale" bar.
       - Stock clashes: if stock moves while a sale is open, the line is flagged with a fix ("Change to N" or "Remove"), and Charge waits until it's fixed. The database's own refusals at checkout point back to the line.
     - **Receipts** (`/admin/sales/[id]`): a paper slip that prints on an 80 mm roll or A4. Shop details are placeholders in `lib/admin/shop.ts`, and the slip says "This is not an official receipt."
     - **Voids:** the owner can void a sale with a reason. The stock goes back as a return, and the receipt is stamped VOIDED.
     - **`/admin/sales`:** staff see today's sales; the owner picks any period and sees totals (sales, total, cash, GCash; voids excluded).
     - **Migration `20261007000000_pos_gcash_and_voids.sql`:** adds the GCash reference (one live sale per reference) and voids. Until it runs, cash sales still work, but GCash sales and voids ask for the update. It also adds:
       - a one-time key per sale, so a Charge retried after a lost reply returns the same sale instead of recording it twice
       - GCash pays exactly the database's total
       - refusals name the variant, so the cart line is found even when a SKU has spaces
     - **Keeping the sale:** the open sale is kept in the browser tab, so a stray tap or a refresh doesn't lose it.
     - **Reports:** a voided sale's stock return counts against "Sold", not as a customer return.
     - **Owner totals:** the Sales page's totals cover the whole period, not just the 300 sales listed.
     - No discounts: everything sells at its listed price.
9. **Sales reports:** owner only.
   - **Built (2026-10-05):** Reports now has two tabs, Sales (the default) and Inventory (the Phase 6 report), sharing one period picker that's kept when switching tabs. The Sales tab has:
     - **Summary:** sales total, number of sales, average sale, and pieces sold, each compared with the same-length period before (none for All time). Cash and GCash show with their share; voided sales are noted and left out.
     - **Sales over time:** a column chart per hour (one day), per day (up to about three months), or per month, with a table version.
     - **Best sellers:** top 10 products by sales total, and top 10 sizes and colors by pieces.
     - **By cashier:** sales, average, total, and share for each person.
     - **Print and CSV:** every section prints and downloads as CSV.
     - **Migration `20261008000000_sales_report.sql`:** adds `rpc('sales_report')`, which sums everything in the database (owner only, through RLS). The follow-up `20261008120000_sales_report_ties.sql` ends ties in the top-10 lists on name and id, so the page and its CSV always list the same rows.
     - **Print:** each report prints with its own footer ("Sales report" / "Inventory report") through named print pages.
     - **Phone tables:** the tables scroll sideways in labelled regions with the first column pinned, and the cashier table drops Average on phones.
     - **Home:** the "Inventory report" button now opens the Inventory tab.
   - **Follow-up migration `20261007120000_pos_sale_key.sql`:** brings Phase 8's sale function to its final reviewed version, because the first draft of `20261007000000_pos_gcash_and_voids.sql` had already been applied.
   - Not yet possible: profit and margin (no cost price), and custom orders and online payments (Phases 10–11).
10. **Custom orders:** accept or decline, production status, finished photo.
    - **Built (2026-10-05):**
      - **`/admin/orders`** (More → Custom orders): status tabs with counts (Open, New, Accepted, In production, Ready, Completed, Declined or cancelled, All) and a search over order number, customer, and items.
      - **The order page:** a progress track, then the next step for the order's status:
        - New: set the price and accept, or decline with a reason the customer sees.
        - In production: tick off printing, cutting, sewing, inspection, and folding and packing. A failed inspection sends the order back to printing with a note.
        - Ready, once all five steps are done.
        - Picked up.
      - Also on the page: what was ordered, up to 4 finished photos for the customer, the customer's contact, the price with its 50% down payment and balance, the full history, and cancel with a reason.
      - **Migration `20261009000000_custom_order_production.sql`:**
        - production steps, changed through `set_production_step` and `reprint_custom_order` and taken in order; a reprint clears every step
        - `reopen_custom_order`: a ready order goes back to production with a reason in its history, and the customer gets a gentler message
        - live updates for orders, steps, photos, and history
        - finished photos, at most 4, in the private `order-photos` bucket
        - status moves limited to real transitions, with ready requiring every step done
      - **Sample orders:** `supabase/seed/sample-custom-orders.sql` loads nine across every status, from four sample customers who can't log in; `remove-sample-custom-orders.sql` removes them.
      - **Deferred:**
        - staff entering orders for walk-in customers
        - the customer's own order page
        - enforcing the down payment (Phase 11)
        - telling the customer when an accepted order's price changes
        - searching orders beyond the newest 300 in a tab
11. **Payment verification:** GCash reference and screenshot review, down payment and balance.
    - **Built (2026-10-05):**
      - **`/admin/payments`** (More → Payments): tabs To review (oldest first, with a live lamp), Verified, Rejected, and All, each with exact counts. Rows show order, customer, type and method, amount, and status.
      - **A payment's page:**
        - To review: the GCash reference, the order total, what was paid before, and what's still due. Then Verify, or Reject with a reason the customer sees, plus the screenshot (a signed link to the private `payment-proofs` bucket).
        - A payment above what's due, or on an order that was never accepted or was declined, can only be rejected.
        - On a cancelled order it can still be verified, so it counts toward the refund.
        - Verified: a **payment slip** that prints on the 80 mm roll or on A4. It shows the order as it stood when this payment was verified.
      - **On the order page, "Price and payments":**
        - totals (paid so far, still due, waiting for review), every payment linked to its page
        - **Record a payment**: any amount up to what's due; cash, or GCash with its 13-digit reference and an optional screenshot; a note. It counts as verified at once, and the customer is told. Chips fill in the rest of the down payment or the balance, and the dialog warns when a customer payment is still waiting for review.
        - On cancelled orders, the owner records **refunds** (up to what was paid less what was refunded, with a note); the customer is told.
      - **The 50% rule:**
        - Production waits for the down payment, and pickup for the full amount.
        - The owner can make an exception with a reason, which goes into the history.
        - An order picked up on that exception can still take its balance.
      - **Migration `20261010000000_custom_order_payments.sql`:**
        - the payment, verify, reject, refund, and exception functions
        - refund and exception tables
        - the rule in the status trigger
        - one GCash reference per live payment
        - staff screenshot uploads
        - live updates
      - **Follow-up `20261010120000_custom_order_payment_fixes.sql`:**
        - Payments are written only through those functions. Staff can't insert or edit payment rows directly.
        - Customers submit only GCash, as "submitted", with a 13-digit reference, and can't write the staff note.
        - References are stored as digits only.
        - Only a submitted GCash payment can be verified.
        - Verify works on completed and cancelled orders.
        - Refunds notify the customer.
        - The price can't change once production starts, or drop below what's paid.
      - **Sample payments:** `supabase/seed/sample-payments.sql` (run after the sample orders). `remove-sample-custom-orders.sql` removes them too.
      - **For the customer app:** insert a payment with `status = 'submitted'`, `method = 'gcash'`, the 13-digit `gcash_reference`, and optionally `gcash_screenshot_url` under `payment-proofs/{customer_id}/{order_id}/`.
      - **Deferred:**
        - a request key on recorded payments, so a retried save after a lost response can't record the same cash twice (as the POS sale key does)
        - payments on walk-in orders
        - the customer's own payment screen
12. **Chat and notifications:** customer and staff messaging per order.

## Hardening to consider (deferred on purpose)

- **Atomic product save:** move the product save into one database function (a new migration) so a failure midway can't leave partial changes. Phase 3 instead makes every step self-correcting on retry and keeps new products hidden until the save completes.
- **Batch stock save:** one database function that applies a whole multi-size adjustment in a single transaction (with a request id so a retried save can't double a restock). Phase 4 runs each change separately, a few at a time, and reports any that fail.
- **Atomic recount:** a database function that sets a counted number under the row lock, so a sale landing at the same instant can't skew the correction. Phase 4 reads the count milliseconds before writing.
- **History totals in SQL:** a `security invoker` function that sums pieces in/out for the history filters. Phase 5 reads the quantities 1,000 rows at a time, which is fine for a shop's volume but slower at scale. The list itself shows up to 500 rows per view.
- **Edit conflicts:** check `updated_at` so two people editing the same product don't overwrite each other's changes.
- **Staff invite links:** the owner enters an email and the person signs up straight into staff. Accounts log in by username today, so this needs a server-side key and email setup. Phase 7 asks new staff to sign up as customers first.
- **Instant removal:** add `profiles` to the realtime publication so a removed staff member's open admin tab leaves at once, instead of on their next page or action.
- **Recorded-payment retries:** `record_custom_order_payment` has no request key. If the response is lost after the save, a retry records a second payment (still capped at what's due). Add a key like the POS sale's.
- **Sales visibility:** staff seeing only today's sales is a screen rule; the `sales` read policy lets any staff member read every sale through the API. Narrow it in RLS if older sales should be owner-only at the data level.
- **Sales totals in SQL:** the Sales report sums in the database (Phase 9). The Sales list's owner totals still add up 1,000 rows at a time in the app; they could call `sales_report` instead.
- **Contact privacy (existing RLS):** the profiles read policy lets any signed-in customer read every column of staff and owner profiles, including email and phone. That access exists for chat names. It also lets every staff member, not only the owner, read all customers' contact details through the API. Fix with a view or `security definer` function that exposes only `id, username, full_name, avatar_url` for chat, and keep the table itself to "own row, or staff". The Staff screen's owner-only contact column is a screen rule, not a data boundary, until then.

## How each phase runs

1. A short round of questions, only on what that phase leaves open.
2. Build, then check in the browser at desktop, tablet, and phone sizes, in light and dark.
3. Independent review, fixes, and a short report of what changed and how to try it.
