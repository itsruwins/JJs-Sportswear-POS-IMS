---
version: 1
slug: "app-admin-layout-tsx"
primary_target: "app/admin/layout.tsx"
related_targets: ["app/admin/page.tsx"]
---

# Admin shell (/admin)

Mode: Operate. Owner and staff of J&J Sportswear on desktop, tablet, and phone; light with dark following the system. Phase 1 of docs/admin-plan.md: role-gated /admin, staff and owners redirected there after logging in, logged-out visitors sent to the landing page with the login sheet open, logged-in customers sent to the landing page. Every future section is visible in navigation and marked Soon. Home shows a greeting and live counts from the database. Code-led build.

## Direction contract

THESIS: The admin is one counter tool reached through a floating dock, the way a counter tablet or phone already works. It refuses the category default of a dense left sidebar over a grid of KPI tiles.

OWN-WORLD: Calm neutral ground from DESIGN.md (ground, ground-2, ink, line). Court green appears only on the live readout board, the active dock item, and primary actions; amber only for low stock and live state. Archivo voices: board numerals for counts, display for page titles, label for small headings. Live counts sit on off-white flip cards. Translucent top bar. The dock is a solid white bar (raised charcoal in dark mode) with a thin border and a court-green pill for the current section; unbuilt sections are dimmed with a dot and a "Coming soon" tip; hover only darkens text. (Dock look set by the user on 2026-10-04, replacing the earlier translucent dock.) Press travel on every control.

STORY: Staff land here after logging in, read the shop's numbers at a glance, see what needs restocking, and reach any section from the dock. Unbuilt sections show as Soon, so the roadmap is visible without broken pages.

FIRST VIEWPORT: The translucent top bar holds the J&J wordmark with "Admin" and an account button (name, role, View shop, Log out). Next comes a greeting ("Good morning, Roince"), the date in Manila time, and a role badge. The green readout board shows four flip-card counts: products, variants, low stock, and out of stock. Below, "Needs restock" takes two thirds of the width and the owner's "Getting set up" checklist takes one third. A floating dock at bottom center holds Home, Products, Stock, History, and More; More opens a panel anchored to it listing POS, Orders, Payments, Chat, Reports, and Staff with Soon tags. On phones the dock becomes a full-width tab bar above the safe area.

FORM: Tablet Dock, position 7 of 7 on the surface list (sidebar counter board, scoreboard strip header, watch column, command-first search, today queue, counter/back-office tabs, tablet dock). Seed key b41285f8. Signature move: the readout's counts flip in on arrival and flip when a value changes.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Phase 2 additions (Products)

Sample catalog via supabase/seed/sample-products.sql (cleanup: remove-sample-products.sql); illustrations in public/samples/ are sample art. /admin/products: search (name, SKU, tag, exact size, color; words must match one product or one variant), filters (In catalog, Low stock, Sold-out sizes, Archived), sort, URL-synced. Each row: photo tile, name + Sample/Archived pills, colors, size rail (total per size; amber when any color is low; sold-out style when none left in any color), price range, total stock. /admin/products/[id]: read-only detail with photo, tags (link to search), stats, size × color stock grid, and the variants table; Edit shows as Coming soon until Phase 3. Product photos sit on a light backdrop in both themes; sold-out cells use their own dark-mode treatment.


## Phase 3 additions (Add and edit products)

/admin/products/new and /admin/products/[id]/edit share one form: Details (name, tags as chips with suggestions, description), Photos (up to 6, one main, resized/converted in the browser, uploaded to product-images/{productId}/), Sizes and colors (standard size list in four groups: Adult XS–5XL, Women's cut W-XS–W-2XL, Kids 4–14, Accessories; colors typed as chips with catalog suggestions; base price, optional 2XL-and-up upcharge, default low-stock alert), Opening stock (new variants only; existing stock is read-only and changes through Stock in Phase 4), Variant details (auto-suggested SKU PRODUCT-COLOR-SIZE, price, alert level, visible). Errors are inline, clear as the field changes, and focus the first problem. Saving is a server action (requireStaff inside) that is retry-safe. Detail page: Edit (green primary), Archive/Restore, owner-only Delete behind a confirm dialog; products with any stock history can't be deleted (archive instead). Removing a size or color in edit hides those variants rather than deleting them.

## Phase 4 additions (Stock adjustments)

/admin/stock (dock item now live): search + filters (All, Needs restock, Sold-out sizes) over active products, each row with its size rail and an Adjust button; a "Recent changes" log (latest 8 inventory_transactions with type, reason, before → after, who, when). Product pages get "Adjust stock" as the primary action (Edit becomes secondary). The adjust sheet (wide native dialog; bottom sheet on phones) picks Restock / Return / Damage / Recount, then a size × color grid of amounts with live "now → next" previews; Recount is prefilled with recorded counts and logs the difference as a correction. One-tap reason picks per type (first preselected) plus an optional note. Each change goes through rpc adjust_stock independently; failures stay on their cells with the reason ("Only 4 left…").
