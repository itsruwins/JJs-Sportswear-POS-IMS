---
version: 1
slug: "app-customer-layout-tsx"
primary_target: "app/(customer)/layout.tsx"
related_targets: ["app/(customer)/shop/page.tsx","app/(customer)/orders/page.tsx"]
---

# Customer app shell (/shop, /orders, /design, /chat, /account)

Mode: Operate. Customers of J&J Sportswear (teams, schools, walk-in buyers), mostly on phones, light with dark following the system. Phase C1 of docs/customer-plan.md: everything except the landing page sits behind login; customers land on /shop after logging in; staff and owners are sent to /admin. Tabs not built yet show their honest empty state and say which update brings them. Code-led build, structure pinned by the user (phone-first app with a tab dock, top nav on desktop).

## Direction contract

THESIS: The customer gets their own seat at the shop's scoreboard: the same court-green world and the same dock the counter uses, so both sides of the counter read as one system. It refuses the storefront default of a mega-menu header, promo banners, and a cart icon.

OWN-WORLD: Calm ground, ground-2, ink, and line from DESIGN.md. Court green only on the current tab's pill, primary actions, and the order lamp strip; amber only for live or low, so the empty screens show none. Archivo voices: display for page titles, label for small headings, board numerals for counts. Translucent top bar; on phones and tablets the admin's solid dock with a green pill; on desktop the same four tabs sit as pills in the top bar, and Account moves into the avatar menu. Press travel on every control.

STORY: A customer signs up or logs in, lands in Shop, and finds every place they will use (Shop, Orders, Design, Chat, Account) one tap away. Each unbuilt tab says plainly what it will hold.

FIRST VIEWPORT: Top bar: wordmark (to /shop), desktop tab pills, theme toggle, avatar button with name and @username. Shop: "Good evening, Ana." in display type with the Manila date, then one panel naming what the catalog will show. Orders: title, then a small idle board with the five stage lamps (Placed, Accepted, In production, Ready, Picked up) above "No custom orders yet." Phone: full-width tab bar above the safe area.

FORM: User-pinned (phone-first app with a tab dock, mirroring the admin's Tablet Dock). No concept seed was rolled; the structure was decided in the plan round on 2026-10-07.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
