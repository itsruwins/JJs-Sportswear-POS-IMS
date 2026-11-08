---
version: 1
slug: "app-customer-shop-page-tsx"
primary_target: "app/(customer)/shop/page.tsx"
related_targets: ["app/(customer)/shop/[id]/page.tsx"]
---

# Shop catalog (/shop, /shop/[id])

Mode: Operate (browse-to-decide). Phase C2 of docs/customer-plan.md. Customers browse ready-made apparel on phones, check exact pieces left per size and color, and buy at the counter (no cart; ERD has no online sales). User asked for a Nike/Adidas-style shop inside the J&J world. Code-led; structure pinned by the user in the C2 question rounds (2026-10-07).

Update (2026-11-09, Phase T1 of docs/ticket-plan.md): the user asked for a cart. "Add to cart" replaces "Buy at the shop" and its sheet; the pickup details moved to /cart. The no-cart line below is superseded.

Decisions: photo-first cards (stock on the product page); exact pieces left; search + sport/type chips + size filter + in-stock toggle (+ sort); Shop opens on featured + category rail + grid; product page primary "Buy at the shop" (sheet with pickup details, placeholders from lib/admin/shop.ts) and secondary "Make a custom version" (opens with C3); sample illustrations recolored per variant color on the photo backdrop, marked as sample art.

## Direction contract

THESIS: A sportswear store window in the Nike and Adidas manner, where the garment leads and chrome recedes, set in J&J's own world. It refuses marketplace clutter: promo banners, discount chips, ratings, badges.

OWN-WORLD: Garments on the light Photo Backdrop tile in both themes; Archivo display (wdth 72) for product and section names; plain ink prices; neutral ground and hairlines. Court green only on the active chip, the selected size, and the primary "Buy at the shop" button; amber only for low stock ("Only 3 left"). Sold-out sizes are hollow, ink-ringed and disabled. Press travel on every control.

STORY: The customer sees what's featured, jumps into a sport, filters by their size, opens a product, picks a color and watches the garment change, reads exactly how many are left, then knows where to go to buy it or to have it made custom.

FIRST VIEWPORT: /shop: a full-width featured band (backdrop panel: the garment large on one side, name in display type, one line, price, ink "View" pill), then a "Shop by sport" row of backdrop tiles (scrolls sideways on phones), then "All products" with count, search, chips, and a row of Size / In stock / Sort controls above a 2/3/4-column grid. /shop/[id]: the garment large on the backdrop (left on desktop, top on phones), then name, price, color swatches, size grid with pieces left, a stock line, green "Buy at the shop", outlined "Make a custom version", and the description.

FORM: User-pinned (Nike-style product listing and product page). No concept seed rolled. Signature interaction: picking a color swatch recolors the garment with the world's 480 ms jersey cross-fade, and the size grid's counts update to that color.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
