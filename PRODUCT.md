# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: customers of J&J Crafts & Sportswear, a custom-printing and sportswear shop in Legazpi City, Albay. They are mostly teams, schools, and organizations ordering custom jerseys and uniforms, plus walk-in buyers of ready-made apparel. They browse on their phones and want to know whether a design or size is available without messaging the shop or visiting in person.

Secondary: the shop's owner and staff, who use the same system for point-of-sale, inventory, custom-order handling, payment verification, and reports. On the landing page they are addressed in a section further down and reach their tools through the shared login.

## Product Purpose

An integrated point-of-sale and inventory management system for J&J Crafts & Sportswear (capstone project, CCDI Legazpi, 2026). It replaces manual logbook order tracking and manual stock checks. Customers browse products with real-time size, color, and stock availability; request custom orders (optionally starting from an AI-generated design); pay a down payment and balance via GCash or cash; follow their order's status; and chat with staff. Staff run sales at the counter, manage products and variants, get low-stock alerts, verify payments, and see sales and inventory reports.

Success for the landing page: a visitor creates an account.

## Positioning

Design it. Track it. Wear it. One place covers the whole journey of a custom team kit: design (with AI or with the shop), down payment, live order status through production, and pickup. The shop's own stock and counter run on the same system.

## Operating Context

- The current custom-order process is manual: confirm the details, check materials (fabric, ink, shirts), finalize the design, collect at least 50% down payment, print, cut, sew, inspect (reprint if defective), fold and pack, record in the logbook, collect the balance, and release for pickup or delivery.
- Payments are cash or GCash. GCash payments carry a reference number and a screenshot that staff verify.
- Accounts use a unique username, not an email. Email is optional (contact and recovery only).
- Roles: customer, staff, owner.

## Capabilities and Constraints

- Stack: Next.js 16 (App Router), React 19, Tailwind CSS 4, Supabase (Auth plus Postgres; schema in `supabase/migrations`).
- Confirmed features: product catalog with variants (size, color, SKU, price, stock), product tags and search, inventory transactions, low-stock alerts, POS sales with receipts, AI design generation, custom orders with items and status history, down-payment/balance payments, customer-staff chat, notifications, and sales and inventory reports.
- Out of scope: RFID, IoT, automatic supplier ordering or purchase recommendations, SMS notifications, accounting, and payroll. The system is built for J&J Crafts & Sportswear only.
- Display name: **J&J Crafts & Sportswear**, or **J&J** where space is tight. Both live in `lib/shop.ts` (`SHOP.name`, `SHOP.short`).

## Brand Commitments

- Name: J&J Crafts & Sportswear (renamed from J&J Sportswear in 2026-11).
- Logo: the shop's official badge, a white J&J on a logo-orange circle with "CRAFTS & SPORTSWEAR" under it. The second J is drawn inverted; that's part of the logo, not an L. Traced to SVG in `features/shared/ui/brand-badge.tsx`, with standalone files in `public/brand/`. In the app it appears as the round badge followed by "Crafts & Sportswear" in Montserrat.
- Personality: athletic and confident.
- Key message: "Design it. Track it. Wear it."
- Theme: light by default, with dark mode following the system setting.
- Must not look like: a generic SaaS template (purple gradients, identical feature-card grids, stock dashboard screenshots), busy e-commerce (Shopee/Lazada-style banners, badges, discount clutter), corporate/enterprise software (navy-and-gray ERP), or a dark techy look (neon on black, terminal or gamer styling).

## Evidence on Hand

- No product photography, testimonials, customer logos, or press yet. Imagery uses placeholders or authored illustrations, marked for replacement.
- No real shop details yet (address, hours, phone, Facebook page). Use clearly marked placeholders for Legazpi City, Albay.
- Do not invent prices, order volumes, customer counts, ratings, or testimonials.

## Product Principles

- Show the order's journey instead of describing it; the custom-order flow is the product.
- Availability is the answer: sizes and stock should be visible without asking anyone.
- One system for both sides of the counter; the customer view and the staff tools describe the same data.
- Local and real over generic: speak like the shop, not like a software vendor.

## Accessibility & Inclusion

No specific standard was set. The baseline is WCAG 2.2 AA contrast, full keyboard access, and reduced-motion alternatives, since most visitors use phones and some will be on slower connections.
