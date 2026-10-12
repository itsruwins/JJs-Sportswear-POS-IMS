# Folder structure plan

Audit date: 2026-10-12. Goal: one folder per feature, holding everything that feature needs.

## Audit — what's wrong today

1. **Features are split by file type, not by feature.** Admin orders lives in three places:
   `app/admin/orders/` (page + actions), `components/admin/orders/` (UI), `lib/admin/orders.ts` (data).
   Every admin and customer feature has the same split.
2. **The customer side imports from admin folders** — 24 imports. Things both sides use
   (catalog, peso formatting, sizes, shop info, photo picker, live refresh, notification bell,
   chat time helpers) live under `admin/`, so `customer/` reaches into it.
3. **Loose files at area roots.** `components/admin/` mixes 7 loose files (dock, top bar, nav,
   home, readout board, bell, live refresh, popover hook) with feature folders. Same in
   `components/customer/` and `lib/`.
4. **Shared UI filed under one feature.** `flip-text` and `wordmark` sit in `landing/` but admin,
   customer and auth use them. `photo-picker` sits in `admin/products/` but 7 files on both sides use it.
5. **Inconsistent file names** for the same role: `order-bits`, `order-parts`, `page-parts`,
   `shop-parts`, `chat-bits` (a `.ts` helper file inside `components/`), `order-views`,
   `order-data` / `shop-data` / `design-data` vs admin's mixed `orders.ts`.
6. **Binary assets in `lib/`.** `lib/customer/fonts/*.ttf` + `OFL.txt`.
7. **Dead files.** `public/{file,globe,next,vercel,window}.svg` (Next starter, unreferenced).

Fine as-is: `supabase/`, `docs/`, `types/`, root config files, `.impeccable/`. No unused
components were found — every component file is imported somewhere.

## Target layout

```
app/                     routes only: page, layout, route, not-found
features/
  admin/<feature>/       admin-only features
  customer/<feature>/    customer-only features
  landing/               the public home page
  shared/                used by more than one side
lib/                     app-wide plumbing: supabase, theme, paths, shop info
assets/fonts/            font files read on the server
```

### Rules

1. `app/` only holds Next route files. They import from `features/` and render.
2. `features/admin` and `features/customer` never import each other. Both may use `features/shared` and `lib`.
3. Features on the same side may import each other (admin orders ↔ payments is fine).
4. Use `@/` imports. `./` only for files in the same folder.
5. File roles inside a feature folder:

| File | Holds |
|---|---|
| `components/` | React components (`.tsx`) only |
| `actions.ts` | server actions (`"use server"`) |
| `data.ts` | Supabase reads and the types they return |
| `model.ts` | pure types, constants and rules, no database |
| `validation.ts` | form input checks |
| other `*.ts` | one clear job, named for it (`sku.ts`, `csv.ts`, `flux.ts`) |

Component files keep their feature prefix (`order-view.tsx`, not `view.tsx`) so editor tabs stay readable.
Small building blocks of a feature use one suffix: `-parts.tsx`.

## File-by-file moves

Routes in `app/` stay where they are; only their imports change. Every `app/**/actions.ts` moves into its feature.

### features/shared

| New | From |
|---|---|
| `ui/live-refresh.tsx` | `components/admin/live-refresh.tsx` |
| `ui/notification-bell.tsx` | `components/admin/notification-bell.tsx` |
| `ui/use-popover-open.ts` | `components/admin/use-popover-open.ts` |
| `photos/prepare-upload.ts` | `prepareForUpload()` pulled out of `components/admin/products/photo-picker.tsx` ¹ |
| `ui/theme-button.tsx` | `components/theme-button.tsx` |
| `ui/wordmark.tsx` | `components/landing/wordmark.tsx` |
| `ui/flip-text.tsx` | `components/landing/flip-text.tsx` |
| `auth/components/auth-dialog.tsx` | `components/auth/auth-dialog.tsx` |
| `auth/components/auth-provider.tsx` | `components/auth/auth-provider.tsx` |
| `auth/credentials.ts` | `lib/auth.ts` |
| `catalog/catalog.ts` | `lib/admin/catalog.ts` |
| `catalog/sizes.ts` | `lib/admin/sizes.ts` |
| `catalog/colors.ts` | `lib/customer/colors.ts` |
| `chat/format.ts` | `components/admin/chat/chat-bits.ts` |
| `orders/tables.ts` | `ORDER_TABLES` pulled out of `lib/admin/orders.ts` ² |

¹ Only the product form uses the `PhotoPicker` component; the other 7 files only use its `prepareForUpload()` helper. So only the helper is shared. The picker stays with admin products (`products/components/photo-picker.tsx` in S3).
² The customer order page imports `ORDER_TABLES` from admin orders. It's the only thing it needs from there.

### lib and assets

| New | From |
|---|---|
| `lib/paths.ts` | `lib/customer/paths.ts` |
| `lib/shop.ts` | `lib/admin/shop.ts` |
| `lib/supabase/*`, `lib/theme.ts` | stay |
| `assets/fonts/*` | `lib/customer/fonts/*` ³ |

³ Done in S1. `preview-art.ts` now reads `process.cwd()/assets/fonts`. The build's file trace for `/design` includes all three font files, so `next.config.ts` needs no `outputFileTracingIncludes`.

### features/admin

| New | From |
|---|---|
| `shell/components/admin-dock.tsx` | `components/admin/admin-dock.tsx` |
| `shell/components/admin-top-bar.tsx` | `components/admin/admin-top-bar.tsx` |
| `shell/nav.ts` | `components/admin/nav.ts` |
| `shell/session.ts` | `lib/admin/session.ts` |
| `home/components/admin-home.tsx` | `components/admin/admin-home.tsx` |
| `home/components/readout-board.tsx` | `components/admin/readout-board.tsx` |
| `chat/components/{chat-client,chat-shell,chat-thread}.tsx` | `components/admin/chat/` |
| `chat/actions.ts` · `chat/data.ts` | `app/admin/chat/actions.ts` · `lib/admin/chat.ts` |
| `history/components/{history-filters,history-list,range-picker}.tsx` | `components/admin/history/` |
| `history/data.ts` | `lib/admin/history.ts` |
| `orders/components/{order-actions,order-view,orders-list}.tsx` | `components/admin/orders/` |
| `orders/components/order-parts.tsx` | `components/admin/orders/order-bits.tsx` |
| `orders/actions.ts` · `orders/data.ts` | `app/admin/orders/actions.ts` · `lib/admin/orders.ts` |
| `payments/components/{payment-actions,payment-queue,payment-view}.tsx` | `components/admin/payments/` |
| `payments/components/payment-parts.tsx` | `components/admin/payments/payment-bits.tsx` |
| `payments/actions.ts` · `payments/data.ts` | `app/admin/payments/actions.ts` · `lib/admin/payments.ts` |
| `pos/components/pos-screen.tsx` · `pos/actions.ts` | `components/admin/pos/` · `app/admin/pos/actions.ts` |
| `products/components/{chip-input,photo-picker,product-actions,product-form,products-browser}.tsx` | `components/admin/products/` |
| `products/components/product-parts.tsx` | `components/admin/products/product-bits.tsx` |
| `products/actions.ts` | `app/admin/products/actions.ts` |
| `products/validation.ts` · `products/sku.ts` | `lib/admin/product-input.ts` · `lib/admin/sku.ts` |
| `reports/components/{report-controls,report-tables,sales-chart,sales-report}.tsx` | `components/admin/reports/` |
| `reports/data.ts` · `reports/csv.ts` | `lib/admin/sales-report.ts` · `lib/admin/csv.ts` |
| `sales/components/{receipt-actions,receipt,sales-list}.tsx` | `components/admin/sales/` |
| `sales/data.ts` | `lib/admin/sales.ts` |
| `staff/components/staff-screen.tsx` | `components/admin/staff/` |
| `staff/actions.ts` · `staff/data.ts` | `app/admin/staff/actions.ts` · `lib/admin/staff.ts` |
| `stock/components/{adjust-button,adjust-sheet,recent-moves,stock-browser}.tsx` | `components/admin/stock/` |
| `stock/actions.ts` | `app/admin/stock/actions.ts` |
| `stock/data.ts` | `lib/admin/inventory.ts` + `lib/admin/stock.ts` (12 lines, merged in) |
| `stock/model.ts` | `lib/admin/stock-types.ts` |

### features/customer

| New | From |
|---|---|
| `shell/components/{customer-dock,customer-top-bar,log-out-button,avatar,page-parts}.tsx` | `components/customer/` |
| `shell/nav.ts` · `shell/session.ts` | `components/customer/nav.ts` · `lib/customer/session.ts` |
| `account/components/account-view.tsx` | `components/customer/account/` |
| `account/actions.ts` · `account/validation.ts` | `app/(customer)/account/actions.ts` · `lib/customer/account.ts` |
| `chat/components/{ask-shop,chat-widget}.tsx` | `components/customer/chat/` |
| `chat/actions.ts` · `chat/data.ts` | `app/(customer)/chat/actions.ts` · `lib/customer/chat.ts` |
| `design/components/studio.tsx` | `components/customer/design/` |
| `design/actions.ts` | `app/(customer)/design/actions.ts` |
| `design/data.ts` · `design/model.ts` | `lib/customer/design-data.ts` · `lib/customer/design-studio.ts` |
| `design/{flux,preview-art,sample-art}.ts` | `lib/customer/` |
| `orders/components/{cancel-request,order-detail,order-parts,pay-modal,request-form}.tsx` | `components/customer/orders/` |
| `orders/components/orders-list.tsx` | `components/customer/orders/order-views.tsx` |
| `orders/actions.ts` | `app/(customer)/orders/actions.ts` |
| `orders/data.ts` · `orders/model.ts` | `lib/customer/order-data.ts` · `lib/customer/orders.ts` |
| `shop/components/{garment-art,product-detail,product-view,shop-controls,shop-parts,shop-view}.tsx` | `components/customer/shop/` |
| `shop/data.ts` · `shop/model.ts` | `lib/customer/shop-data.ts` · `lib/customer/catalog.ts` |

### features/landing

| New | From |
|---|---|
| `components/{ai-studio,garments,order-band,scoreboard,site-footer,site-nav,staff-box-score,stock-standings,username-form}.tsx` | `components/landing/` |
| `sample-data.ts` | `components/landing/data.ts` |

After all moves, `components/`, `lib/admin/` and `lib/customer/` are empty and get deleted.

## Phases

Each phase ends with `npx tsc --noEmit`, `npm run lint` and `npm run build` passing, and a
click-through of the touched screens. Use `git mv` so file history follows the move.

- **S1 — Housekeeping.** ✅ Done 2026-10-12. Deleted the 5 starter SVGs. Moved fonts to `assets/fonts/` and fixed the path in `preview-art.ts`. tsc, lint and build pass, and a test preview rendered with the moved fonts.
- **S2 — Shared + lib.** ✅ Done 2026-10-12. Built `features/shared/` and made the `lib/` moves above: 15 files moved with `git mv`, two helpers pulled out, and 106 imports rewritten. No customer → admin, admin → customer, or shared → side imports remain. tsc, lint and build pass; the landing page and login redirects were smoke-tested on `next start`.
- **S3 — Admin.** Move all admin features + shell + home. Move `app/admin/**/actions.ts`.
- **S4 — Customer.** Move all customer features + shell. Move `app/(customer)/**/actions.ts`.
- **S5 — Landing + wrap-up.** Move landing, delete empty folders, update the old paths in
  `docs/customer-plan.md` (16 mentions) and `docs/admin-plan.md` (2), and add the rules above to `CLAUDE.md`.

## Not moved, but flagged (duplicates found while mapping)

These are code duplicates, not folder problems. They can go into `shared/` during S2 or later:

- `MESSAGE_MAX` and `CHAT_PHOTOS_MIGRATION` defined in both `lib/admin/chat.ts` and `lib/customer/chat.ts`.
- `OrderStatus` and `STEPS` defined in both `lib/admin/orders.ts` and `lib/customer/orders.ts`.
- `initials()` written three times: `lib/customer/session.ts`, `components/admin/admin-top-bar.tsx`, `components/admin/chat/chat-bits.ts`.
- `manilaToday()` in both `lib/admin/history.ts` and `lib/customer/orders.ts`.
- Two different `StatusPill`s for orders (admin `order-bits`, customer `order-parts`) and a third for stock (`report-tables`). The stock one should be renamed `StockPill` to avoid confusion.
