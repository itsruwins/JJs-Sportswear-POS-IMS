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

OWN-WORLD: Calm neutral ground from DESIGN.md (ground, ground-2, ink, line). Court green appears only on the live readout board, the active dock item, and primary actions; amber only for low stock and live state. Archivo voices: board numerals for counts, display for page titles, label for small headings. Live counts sit on off-white flip cards. Translucent top bar and dock, with content scrolling beneath. Press travel on every control.

STORY: Staff land here after logging in, read the shop's numbers at a glance, see what needs restocking, and reach any section from the dock. Unbuilt sections show as Soon, so the roadmap is visible without broken pages.

FIRST VIEWPORT: The translucent top bar holds the J&J wordmark with "Admin" and an account button (name, role, View shop, Log out). Next comes a greeting ("Good morning, Roince"), the date in Manila time, and a role badge. The green readout board shows four flip-card counts: products, variants, low stock, and out of stock. Below, "Needs restock" takes two thirds of the width and the owner's "Getting set up" checklist takes one third. A floating dock at bottom center holds Home, Products, Stock, History, and More; More opens a panel anchored to it listing POS, Orders, Payments, Chat, Reports, and Staff with Soon tags. On phones the dock becomes a full-width tab bar above the safe area.

FORM: Tablet Dock, position 7 of 7 on the surface list (sidebar counter board, scoreboard strip header, watch column, command-first search, today queue, counter/back-office tabs, tablet dock). Seed key b41285f8. Signature move: the readout's counts flip in on arrival and flip when a value changes.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
