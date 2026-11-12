# Brand plan

One phase per session. Each phase ends finished and tested, and the next one starts only after you approve it. Every phase starts with its own questions.

Goal: the app matches the shop's official logo, a white J&J on an orange circle with "CRAFTS & SPORTSWEAR" under it. The court-green scoreboard world becomes a charcoal scoreboard with the logo's orange as the brand color, and the shop's name becomes J&J Crafts & Sportswear.

Source file: the official logo PNG (1254 × 1254, orange circle on an off-white square). There is no vector file. The second J is drawn inverted, so it can look like an L.

## Decisions (2026-10-27)

- **Name:** "J&J Crafts & Sportswear" in full on receipts, the footer, page titles, metadata and legal lines. "J&J" where space is tight (phone nav, chat header). It is still J&J; the inverted second J is part of the logo.
- **Orange's reach:** orange is the accent, not the surface. The green boards become charcoal, like a real gym scoreboard. Orange marks the brand (logo, badge) and the primary action (main buttons, active states, accent type, the order band, chart columns).
- **Alerts:** "needs attention now" (low stock, money owed, unread, live stage, focus rings, selection) moves from amber to a shot-clock yellow, clearly lighter and yellower than the brand orange. It means the same thing, so the Amber-Is-Now rule becomes the Yellow-Is-Now rule. Text on yellow is always the dark yellow ink.
- **Button orange:** the logo keeps the exact orange. Buttons, links and orange text use a slightly deeper orange so white text passes 4.5:1.
- **Logo in the top bars:** a small round badge (orange circle, white J&J) followed by the name in text, on the customer, admin and landing bars.
- **Background:** warm off-white, matching the logo's paper. Neutrals lean warm (toward the orange) instead of green.
- **Dark mode:** stays. Warm charcoal ground, and the boards go one step deeper.
- **Font:** Montserrat (SemiBold, wide tracking, the logo's "CRAFTS & SPORTSWEAR" voice) for the name beside the badge, small uppercase labels and section kickers. Archivo stays for body text and the board numerals, which need its narrow width.
- **Also in scope:** favicon and phone home-screen icon, the logo on receipts, slips and report printouts, and re-skinned Supabase Auth emails.

## Palette

Starting values, measured against the logo. Contrast is WCAG 2.x, checked with a script. Each phase re-checks the values it touches.

| Role | Token (new) | OKLCH | Hex | Checks |
| --- | --- | --- | --- | --- |
| Logo orange (exact) | `brand` | 0.653 0.215 37.5 | #F64D03 | Logo, badge, large type only (white on it 3.5:1, fine for large type only) |
| Action orange | `action` | 0.565 0.19 37.5 | #CD3C00 | White text 4.97 ✓, as text on ground 4.62 ✓ |
| Action hover | `action-deep` | 0.5 0.17 37.5 | #AE3000 | White text 6.5 ✓ |
| Board (charcoal) | `board` | 0.255 0.012 50 | #28211E | Chalk 14.7 ✓, muted chalk 8.4 ✓, logo orange 4.5 ✓ |
| Board well | `board-deep` | 0.205 0.01 50 | #1B1613 | |
| Now / alert | `signal` (was `amber`) | 0.87 0.17 95 | #F7D22A | Signal ink on it 9.9 ✓, on board 10.7 ✓ |
| Signal ink | `signal-ink` | 0.28 0.06 85 | #362600 | |
| Ground | `ground` | 0.975 0.006 70 | #F9F6F2 | Ink-2 on it 6.95 ✓ |
| Ground 2 | `ground-2` | 0.95 0.008 70 | #F2EEE9 | |
| Ink | `ink` | 0.21 0.012 50 | #1D1713 | |
| Ink muted | `ink-2` | 0.45 0.014 50 | #5C534E | |
| Card | `card` | 0.985 0.004 70 | #FCFAF7 | Card ink 18 ✓ |
| Dark: ground | | 0.165 0.01 50 | #120D0A | |
| Dark: orange text | `action-text` | 0.72 0.17 45 | #F97C3D | On dark ground 7.3 ✓ |

Garment and sample colors in `features/shared/catalog/colors.ts` are product data, not theme, and stay as they are.

## Phases

### Phase B1: The logo as code
- Trace the PNG into clean SVGs: the full badge (circle, J&J, "CRAFTS & SPORTSWEAR"), the compact badge (circle and J&J only, for 16–40px), and a one-color black version for thermal receipts.
- Check the trace against the PNG at large size (overlay) and send it for approval before anything uses it.
- Favicon, app icon and Apple touch icon from the compact badge, using Next's file conventions (read `node_modules/next/dist/docs/` first). Remove the old `favicon.ico`.
- `features/shared/ui/wordmark.tsx` becomes the badge plus the name in text. Its `ground` and `board` tones stay so the three top bars and the chat header keep working.
- **Done when:** the badge matches the logo when overlaid, the favicon shows in the tab, and the three top bars show badge + name at phone and desktop widths.
- **Decisions (2026-10-27):** an inline SVG component for the app, plus standalone files in `public/brand/`. The tagline is traced like the letters, not re-set. Beside the badge the bars say "Crafts & Sportswear" (the badge already says J&J), and on phones only the badge shows. Montserrat arrives now, for that text only.
- **Built 2026-10-27:**
  - Traced with potrace from the PNG (2× upscale, integer coordinates on a 1000-unit circle). The circle is drawn as a true circle, since the PNG's is about 0.6% out of round. Overlaid on the original, 0.08% of the pixels inside the circle differ at the 4× trace and about 0.2% at the shipped 2× trace, all on letter edges. The source PNG is kept at `docs/brand/jj-logo-source.png`.
  - `features/shared/ui/brand-paths.ts`: the letters, the tagline, and a compact J&J (centred, 1.12×), all `evenodd`. `features/shared/ui/brand-badge.tsx`: `BrandBadge`, `compact` (default) or `full`.
  - `public/brand/`: `jj-badge.svg`, `jj-badge-compact.svg`, black knockout versions of both (one path, so the letters show the paper on a thermal roll), and PNGs at 512 and 1024 plus a black 1024.
  - `app/favicon.ico` (16, 32, 48), `app/icon.svg`, and `app/apple-icon.png` (180, full-bleed orange so iOS can round it).
  - `Wordmark` is now the 36px badge plus "Crafts & Sportswear" in the new `.voice-brand` (Montserrat 600, uppercase, 0.16em). The customer bar switched to `compact` so it also shows only the badge on phones. The chat panel header's hand-built J cards became the badge.
  - A `--brand` token (exact logo orange) in `app/globals.css`. Nothing else in the palette changed; that's B2.
  - Checked: typecheck, lint, `npm run build`; landing nav and footer screenshotted at 1440 and 390, light and dark. The customer and admin bars use the same component but need a login, so they weren't screenshotted.
  - Left for B4: the links' aria-labels and the chat header still say "J&J Sportswear".

### Phase B2: New palette
- Rewrite the tokens in `app/globals.css` for light, dark (system) and dark (picked), from the palette above: charcoal boards, warm neutrals, `brand` / `action` / `action-deep` / `action-text`, and yellow `signal`.
- Rename `amber` / `amber-ink` to `signal` / `signal-ink` in the CSS and every class that uses them (mechanical replace, then a grep for leftovers).
- Primary buttons that were Court Green on ground (Create account, Charge ₱X, Verify, Record a payment, Send, the Review sale bar) become action orange. Board surfaces become charcoal.
- `viewport.themeColor` in `app/layout.tsx` gets the new grounds.
- Rewrite `DESIGN.md`'s color section and rules (One Green Rule → one-orange rule, Amber-Is-Now → Yellow-Is-Now) and its frontmatter values. Update `.impeccable/design.json` to match.
- **Done when:** no green is left in the theme, every token pair above passes in both themes, and `npm run build` passes.
- **Decisions (2026-10-27):** flip cards stay off-white with dark numerals on the charcoal board. Focus rings are orange everywhere (yellow on off-white is about 1.3:1). Each screen keeps one orange main action, and a control that repeats down a list stays charcoal. In dark mode the board sits a step *lighter* than the page (this replaces "one step deeper" above).
- **Built 2026-10-28:**
  - `app/globals.css` tokens rewritten for light, dark (system) and dark (picked): charcoal `board*`, warm neutrals, and new `brand`, `action` / `action-deep` / `action-ink`, `accent` (lighter in dark), `focus` (= accent), and `signal` / `signal-ink` in place of `amber` / `amber-ink`. `board-text` is gone; its uses became `accent`.
  - New `pick` / `pick-ink` for the chosen one of a set (current dock and tab item, pressed chips and sizes, switches on, unread avatars, done steps). It's charcoal in light, but near-white with dark type in dark mode, because charcoal on the dark page is only 1.3:1 and the fill is the state's only cue there.
  - Every amber use sorted by role: 10 CSS focus rings and every `focus…:shadow-[…]` class went to `--focus`; lamps, low cells, pills, counts, dots and the pay notice went to `signal`. `.is-invalid` now wears the same solid ink ring as `.is-error`, since a yellow ring wouldn't show on off-white.
  - 36 main buttons went to `bg-action text-action-ink hover:bg-action-deep`, and the `green` button constants were renamed `primary`. The staff list's per-row "Make staff" stayed charcoal; its confirm dialog is orange. `Pill` lost its unused `green` tone, and `amber` became `signal`.
  - The sales chart uses `accent` (print: action orange). Green-tinted shadows and scrims moved to the warm hue, the print palette included. Idle lamps got a 1px `board-line` rim so they show on charcoal. `viewport.themeColor` is now #f9f6f2 / #110d0b.
  - `DESIGN.md`: color frontmatter, overview, Colors section, the Yellow-Is-Now, One-Orange and Card Ink rules, component specs, do's and don'ts, and the B1 lockup and Montserrat brand voice. `.impeccable/design.json` regenerated from it.
  - Checked: every pair in the palette table plus pick, in both themes (all pass); typecheck, lint, `npm run build`; landing page screenshotted at 1440 in light and dark, and phone width (Chrome's narrowest window, about 500px, crops the right edge). Only the landing page is reachable without a login, so the admin and customer screens are B3's walk-through.
  - Left as product data: the sample jersey colorways in the landing AI studio (including a green one) and the garment colors in `catalog/colors.ts`.

### Phase B3: Screen-by-screen pass
- Walk every surface in light and dark at phone and desktop widths: landing, shop, product, design studio, orders, pay, chat, account; admin home, POS, stock, products, orders, design orders, payments, sales, receipts, reports, staff, history.
- Fix the places where green carried meaning the new tokens don't express on their own: size rails, period lamps, the order band, sales chart columns (dark mode gets its own validated orange step), unread avatars, the photo backdrop, and the hardcoded values in the landing AI studio and sample data.
- **Done when:** every screen has been seen in both themes and no screen shows yellow unless something is live, low, owed or unread.
- **Decisions (2026-11-11):** walk the real screens with test logins (read-only); the landing demo's green jersey and the Court green / Amber sample chips become J&J orange; B3 fixes color and brand only, everything else goes on a list.
- **Built 2026-11-11:**
  - Walked 27 screens (landing, 19 owner, 7 customer) in light and dark, at 1440 and 390 wide, with a script that also reads every element's computed colors and flags green hues and yellow fills. No green was left in the theme, and no screen showed yellow without something live, low, owed or unread. The "acer" login turned out to be a customer account, so it covered the customer side; staff screens reuse the owner's components.
  - **Yellow on paper:** shot-clock yellow is 1.4:1 on the light ground, so the small yellow dots (low size, a problem beside a field, unread on the dock) and the outlined "now" panels nearly vanished. New `signal-edge` token (oklch 0.6 0.13 85, 3.7:1 on ground; the yellow itself in dark mode). Dots use the new `.signal-dot` class (yellow with a 1px edge rim), and the pay notice and urgent scan notice get a yellow band inside a 1px edge rim.
  - The landing username field's error ring was yellow; it's now the solid ink ring every other field uses (board ink on the board).
  - Landing AI studio: the "Court green" preset is now "J&J orange with charcoal side panels and thin white pinstripes" (logo orange body, charcoal panels and trim, off-white lettering). Sample chips: Court green and Amber became J&J orange; the near-blacks and grays lost their green tint.
  - Last green-tinted values: the sales chart tooltip shadow, and DESIGN.md's board lift, selected tile, hinge, lamp glow and photo backdrop values, which now match the CSS. `.impeccable/design.json` has the new token.
  - Checked: typecheck, lint, `npm run build`.
  - Not seen live because the data doesn't exist yet (nothing low, unread, owed, in production, or sold): low cells and the unread dot in the admin, live period lamps on an order, the pay notice, and the sales chart columns. Their CSS was read and uses the B2 tokens.
  - **Non-color issues found (not fixed, for later):**
    - Admin Home "Getting set up": "Open the counter" still says "once Point of sale is ready", though the POS is built.
    - Admin chat on desktop: the conversation list cuts off the time at its right edge ("Fri").
    - Admin dock: the "Coming soon" item and `.admin-soon-dot` are unused now that every section is built.
    - POS Designs tab on phones: the search placeholder is cut off ("Team, design number, or ticl").
    - Disabled orange buttons (chat Send) turn a muddy brown at half opacity in dark mode.
    - The old name "J&J Sportswear" is still on the payment slip, the ticket's "At the shop", and the landing copy (B4 and B5).

### Phase B4: Name and font
- `SHOP.name` becomes "J&J Crafts & Sportswear". Add a short name ("J&J") next to it in `lib/shop.ts`.
- Replace the 54 hard-coded uses of the old name with `SHOP` (page titles through a title template in the root, customer and admin layouts, chat copy, the pay modal, the footer, the report print line, aria labels).
- Load Montserrat through `next/font` next to Archivo and point the label voice, kickers and the name beside the badge at it. Board numerals and body text stay Archivo.
- Update `PRODUCT.md` (name, brand commitments: the logo now exists).
- **Done when:** a grep for "J&J Sportswear" finds only docs history, and tab titles read correctly on every route.
- **Decisions (2026-11-12):**
  - Montserrat reaches the small uppercase labels on the boards ("kickers") and nothing else. Table headers, field labels, chips and initials stay in the narrow Archivo label voice, because Montserrat is too wide for them.
  - Tab titles: the full name on the landing and customer pages ("Shop · J&J Crafts & Sportswear"), "J&J Admin" on admin pages ("Products · J&J Admin").
  - Copy: swap the name only. No new claims about crafts.
- **Built 2026-11-12:**
  - `lib/shop.ts`: `SHOP.name` is "J&J Crafts & Sportswear", plus `SHOP.short` ("J&J").
  - Title templates: the root layout (`default` with the tagline, `template` "%s · name"), the customer layout (`absolute` name, same template) and the admin layout (`absolute` "J&J Admin", template "%s · J&J Admin"). 27 pages and the admin chat layout now give only their own title. The product page's title is the product name.
  - Every hard-coded name now reads `SHOP`: landing lead, footer, nav aria-label, admin and customer bar aria-labels, the account menu's home link, the chat header, greeting and screen-reader speaker name, the pay modal ("Send to …'s GCash"), and the report's print line. The print footers in `app/globals.css` can't import, so they spell the new name out. The name never breaks across lines in running text (landing lead, chat greeting).
  - New `.voice-kicker` in `app/globals.css` (Montserrat 600, uppercase, +0.1em, a size down to 0.6875rem). Used by the landing scoreboard labels, the admin readout, the POS and design-order Total, the ticket's "Show this at the counter", the POS Payments heading and the slip's "Order slip".
  - `PRODUCT.md` (name, short name, the logo now exists), `DESIGN.md` and `.impeccable/design.json` (name, Board Label now Montserrat, the Montserrat rules) and the two `.impeccable/surfaces` briefs updated.
  - Checked: typecheck, lint, `npm run build`. Every tab title was read in a browser: landing, 19 admin routes and 10 customer routes. Screenshots of the landing, admin home, payment slip (the full name fits on one line at 1.5rem), ticket, chat panel (desktop and phone) and account menu.
  - Not seen live: the sales receipt and the order slip, since there are no sales or walk-in orders yet. They share the payment slip's header markup and width.
  - Still saying the old name, on purpose: comments in the applied initial migration (never edited) and in the one-time seed scripts, plus older plan docs.

### Phase B5: Print
- Logo on the POS receipt, the payment slip, the order slip and the report printouts. Black one-color badge on the 80 mm roll; full color on A4 where the printer allows, black otherwise.
- The print footers carry the new name.
- **Done when:** every printable page has been printed to PDF at 80 mm and A4, and the logo is sharp and in the right color on each.

### Phase B6: Auth emails
- The repo has no `supabase/templates/`, so the Auth emails live in the Supabase dashboard. Write HTML templates (confirm sign-up, reset password, and any others the project sends) with the badge, the new name and the palette, using email-safe inline styles.
- Save them in `supabase/templates/` so they're tracked, with a short note on where to paste each one in the dashboard.
- **Done when:** each template renders in a test send to Gmail on a phone and a desktop, light and dark.

## Open questions for later phases

- B1: where the logo files should live (`public/brand/` vs inline SVG components), and whether the trace needs touch-ups after you review it.
- B2: whether any screen should keep a hint of green (for example, "Verified" or "Paid"), or green leaves the app entirely.
- B5: which printer the shop uses for receipts (thermal is black only).
- B6: which Auth emails the project actually sends (sign-up, reset, email change, magic link).
