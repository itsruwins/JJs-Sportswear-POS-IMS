# Design tickets plan

One phase per session. Each phase ends finished and tested, and the next one starts only after you approve it. Every phase opens with its own questions.

Goal: made-to-order designs join the cart and ticket flow from `docs/ticket-plan.md`. A customer picks a design's style and how many of each size, adds them to the cart, and gets a **design ticket**. At the counter, staff load it into the POS **Designs** tab, so the order is already filled in and only the down payment is left. The order goes through the same `create_counter_order` the counter uses today, so production, payments, and reports don't change.

## Decisions (2026-11-09)

- **Adding:** a size run at once. On a design's page the customer picks a style, sets a count for each size (S ×3, M ×5…), and adds them all in one tap.
- **Team details:** filled in by the customer, all optional: team name, needed-by date, and a names/numbers list. Staff check or finish them at the counter.
- **Separate tickets:** ready-made items and designs never share a ticket. Each kind has its own ticket and code, and one open ticket of each kind at a time.
- **Account:** the order made from a design ticket stays a walk-in order, as today (`customer_id` null). The buyer's name and phone come from the customer's profile, and the ticket itself records that it was ordered.
- **Unchanged from the ticket plan:** codes (JJ- plus 5), QR, 3-day expiry, typed or scanned at the POS, and the counter's day price. Designs have no stock, so nothing is checked or held.

## Phases

### Phase M1: Designs in the cart and on a ticket (customer + database)
- Migration: `cart_set` accepts made-to-order sizes (no stock cap; still at most 99 a size). `counter_tickets` gets a kind (ready-made or design) and the optional team name, needed-by date, and names/numbers. A design ticket is made from the cart's design lines only, and the one-open-ticket rule holds per kind.
- Design page: a style picker, then a size run (a count per size) and **Add to cart**, replacing the "Order at the shop" sheet. It stays on the page with a confirmation, like ready-made.
- Cart: two sections, **Ready-made** and **Made to order**, each with its own total and ticket button. The design section adds the optional team details and the down payment due at the counter (at least half).
- Design ticket page: the code and QR, the size runs per design and style, the team details (editable while open), the total, and the down payment.
- **Done when:** a customer can add a size run, see it in the cart beside ready-made items, and get a design ticket while keeping a ready-made ticket separate.
- **Decided (2026-11-09):** a counter on each size tile (tap to add a piece, then − count +); one card per design and style in the cart with a stepper per size; team details go on the design ticket (not the cart); at most 99 a size.
- **Built (2026-11-09, uncommitted):**
  - Migration `20261027000000_design_tickets.sql`: `cart_set` takes design sizes (no stock, capped at 99); `rpc('cart_add_run', items)` adds a size run all or nothing; `counter_tickets.kind` ('ready' / 'design'), `team_name`, `needed_by`, `roster`; `create_counter_ticket(p_kind default 'ready')` makes one kind, folds only an open ticket of that kind (a design ticket keeps its team details), and now refuses before folding when nothing of that kind is in the cart (it used to re-code an open ticket); `rpc('set_ticket_details')`; `create_ticket_sale` refuses design tickets (DETAIL `ticket:design`).
  - Customer: the design page's size run (`design-detail.tsx`), the cart's Made to order section and run cards (`cart-view.tsx`, `DesignCard` in `cart-parts.tsx`), the shared `cart-note.tsx`, and the design ticket page with `ticket-team.tsx`. The POS says a design ticket is taken on the Designs tab (loading it there is M2).
  - Tested in PGlite against all migrations: 110 checks (25 new for M1). Screens checked through a temporary preview (deleted) in light, dark, and on a phone.

### Phase M2: Load a design ticket at the counter (staff)
- Loading a design ticket's code in the POS (typed, USB scanner, or camera) opens the **Designs** tab with the pieces, team details, and the buyer's name and phone filled in. A design code on the Shelf tab, or a ready-made code on Designs, goes to the right tab.
- Taking the order (at least half down) marks the ticket ordered and records the order on it, in one step, so a ticket can't make two orders.
- **Done when:** a design ticket goes from customer to POS to an order in production, and can't be used twice.
- **Decided (2026-11-09):** an order in progress on the Designs tab asks first (replace it or cancel); staff can change everything once the ticket is loaded (it's an ordinary Designs order, and the ticket points to the order actually taken); the ticket stays **ordered** for good, even if that order is later cancelled; the buyer's name and phone come from the profile and stay editable.
- **Built (2026-11-09, uncommitted):**
  - Migration `20261028000000_design_ticket_orders.sql`: `counter_tickets.status` gains `ordered`; `counter_tickets.custom_order_id` (one order per ticket); `rpc('create_ticket_order')` checks the design ticket is open and not expired, places the order through `create_counter_order` unchanged, marks the ticket ordered, and notifies the customer (bell, type `ticket`: "Ordered at the counter with ₱X down. The rest, ₱Y, is paid at pickup."), all in one step; a retry with the same key hands back the same order. Refusals carry DETAIL `ticket:ordered|paid|expired|cancelled|replaced|missing|ready|taken`.
  - POS: `loadTicket` returns both kinds (with the buyer's name and phone, and the team details for designs); Shelf sends a design code to `/admin/pos?tab=designs&ticket=…`, and Designs sends a ready-made code to `/admin/pos?ticket=…`. Designs tab: ticket code in the search, Scan ticket, the replace dialog, the ticket chip with notes (`orderFromTicket` in `features/admin/design-orders/ticket.ts`), and Place order with the ticket.
  - Customer: the `ordered` status reads "Ordered" (outlined pill, lead "Ordered at the counter on …"), enough for M2; M3 adds the order number, the down payment, and the balance.
  - Tested in PGlite against all migrations: 135 checks (25 new for M2). Screens checked through a temporary preview (deleted) in light, dark, and on a phone.

### Phase M3: The customer after ordering
- The design ticket shows **Ordered**: the order number, what was paid down, and the balance due at pickup. The bell says so.
- Orders lists it with the other tickets.
- **Done when:** the customer can see their design ticket was ordered and what's left to pay.

## Left open for the phase where it matters

- M1: how a size run edits in the cart (per size, or the whole run at once), and the most pieces a design line can hold.
- M3: whether "Ordered" says more than the order number (production steps aren't visible, since the order is a walk-in).
