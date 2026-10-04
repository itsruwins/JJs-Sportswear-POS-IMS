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

## Later phases (planned in detail when we reach them)

7. **Staff and roles:** the owner promotes accounts to staff (`set_user_role`).
8. **Point of sale:** sales at the counter, cash or GCash, change, receipts (`create_pos_sale`).
9. **Sales reports:** owner only.
10. **Custom orders:** accept or decline, production status, finished photo.
11. **Payment verification:** GCash reference and screenshot review, down payment and balance.
12. **Chat and notifications:** customer and staff messaging per order.

## Hardening to consider (deferred on purpose)

- **Atomic product save:** move the product save into one database function (a new migration) so a failure midway can't leave partial changes. Phase 3 instead makes every step self-correcting on retry and keeps new products hidden until the save completes.
- **Batch stock save:** one database function that applies a whole multi-size adjustment in a single transaction (with a request id so a retried save can't double a restock). Phase 4 runs each change separately, a few at a time, and reports any that fail.
- **Atomic recount:** a database function that sets a counted number under the row lock, so a sale landing at the same instant can't skew the correction. Phase 4 reads the count milliseconds before writing.
- **History totals in SQL:** a `security invoker` function that sums pieces in/out for the history filters. Phase 5 reads the quantities 1,000 rows at a time, which is fine for a shop's volume but slower at scale. The list itself shows up to 500 rows per view.
- **Edit conflicts:** check `updated_at` so two people editing the same product don't overwrite each other's changes.

## How each phase runs

1. A short round of questions, only on what that phase leaves open.
2. Build, then check in the browser at desktop, tablet, and phone sizes, in light and dark.
3. Independent review, fixes, and a short report of what changed and how to try it.
