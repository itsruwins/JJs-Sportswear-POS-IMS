# Cart and counter ticket plan

One phase per session. Each phase ends finished and tested, and the next one starts only after you approve it. Every phase opens with its own questions.

Goal: a customer fills a cart in the shop and gets a ticket: a short code and a QR of the code that lists the order. At the counter, staff load the ticket into the POS, so the whole order is already rung up and only payment is left. Nothing is paid online. The sale goes through the same `create_pos_sale` the counter uses today, so payments, receipts, stock, and reports don't change.

## Decisions (2026-11-08)

- **Ticket:** a short code (like `JJ-4K7Q`) plus a QR of the same code. Staff can type it or scan it. Typing is the fallback, because a browser camera can't reliably scan QR codes on iPhone Safari.
- **Stock:** not held. Stock is checked when staff load the ticket, and the ticket says stock can change.
- **What goes in the cart:** ready-made products only. Made-to-order designs keep their "show this at the counter" sheet, since staff still take the team's sizes, names, and numbers, with at least half down.
- **Expiry:** an unused ticket expires after 3 days. The customer can cancel one anytime.
- **Price:** the counter charges today's price, like the POS already does. The ticket's total is labelled an estimate.
- **Staff can edit:** a loaded ticket is an ordinary POS cart. Staff can add, remove, or change lines before charging.

## Phases

### Phase T1: Cart (customer)
- **Decided (2026-11-08):** the cart is saved to the customer's account, so it follows them across devices. A bag icon with a count sits in the top bar on phone and desktop, and the dock keeps its 4 tabs. "Add to cart" replaces "Buy at the shop", and the shop's address, hours, and ways to pay move to the cart page. After adding, the customer stays on the product page and sees "Added to cart · View cart".
- A new migration: `cart_items` (customer, variant, quantity, one row per variant per customer) with RLS so each customer reads and writes only their own lines.
- "Add to cart" on the product page for in-stock variants. Quantity is capped at the stock on hand.
- A cart page at `/cart`: change quantity, remove a line, an estimated total, and the shop's details. Sold-out and low-stock lines are flagged against live stock.
- **Done when:** a customer can add several sizes and colors, change and remove them, the cart survives a reload and shows up on another device, and other customers can't read it.
- **Built 2026-11-09 (uncommitted):**
  - Migration `20261023000000_customer_cart.sql`: `cart_items` (customer + variant key, 1–99 pieces), RLS read and delete own, inserts and updates only through `rpc('cart_set', variant, quantity, add)`. It refuses sold-out, archived, and made-to-order items, caps a line at the stock on hand, allows 50 lines at most, and always lets a line be removed. Only customer accounts have a cart.
  - `features/customer/cart/`: `model.ts` (line states: ok, low, short, sold out, unavailable; estimated total counts only what's on the rack), `data.ts` (cart, per-variant quantities, bag count), `actions.ts` (`addToCart`, `setCartQuantity`, which refresh the page), and components for the bag, the cart rows, and the page.
  - Product page: "Add to cart" replaces "Buy at the shop" and its sheet. A note under the button confirms with "View cart", and the stock line shows how many are already in the cart. Shop variants now carry their id.
  - `/cart`: rows with a stepper, Remove (with Undo), stock flags with their fix, the estimated total, the shop's details, and a note that the counter ticket comes in T2. Before the migration runs it says which update it needs, and the bag shows nothing.
  - DESIGN.md has a new Cart (customer) section, and its shell and product-page passages are updated.
  - Tested in PGlite against every migration in order, with Supabase's default grants: 25 checks covering caps, refusals, the 50-line limit, RLS between customers, direct writes denied, anon denied, archived lines, and re-running the migration. Screens checked on desktop, phone, dark, and empty through a temporary preview route (deleted).

### Phase T2: Ticket (customer + database)
- A new migration (a follow-up file; applied migrations are never edited): tickets and their lines, a function that creates a ticket from a cart with a unique short code, RLS so customers see only their own tickets, and expiry after 3 days.
- "Get my ticket" turns the cart into a ticket. The ticket page shows the code, its QR, the items, and the estimated total. Tickets are listed under Orders, and a ticket can be cancelled.
- **Done when:** a ticket is created with a unique code, other customers can't read it, it expires on time, and cancelling works.
- **Decided (2026-11-09):** the cart's items move into the ticket (the cart empties); "Change items in my cart" and "Cancel ticket" both put them back. One open ticket at a time: a new ticket folds the open one's items in. Codes are `JJ-` plus 5 of 31 letters and numbers with no look-alikes (0/O, 1/I/L); the prefix, case, spaces, and dashes don't matter when typing. An open ticket leads the Orders tab under "Ready for the counter", and closed ones join Past orders. Each ticket's page is `/orders/tickets/[code]`.
- **Built 2026-11-09 (uncommitted):**
  - Migration `20261024000000_counter_tickets.sql`: `counter_tickets` (code, status open / cancelled / replaced / paid, good for 3 days; expired means open past its time, worked out when read) and `counter_ticket_items` (name, size, color, and price as they were, plus the variant). Customers read their own and staff read all (for T3); every write goes through `rpc('create_counter_ticket')` and `rpc('return_counter_ticket', id)`. Making a ticket moves only the lines on the rack (capped at stock); sold-out and no-longer-sold lines stay in the cart. An expired ticket isn't folded into a new one, but it can still go back to the cart.
  - `features/shared/tickets/model.ts` holds the code rules, `normalizeTicketCode` (for the POS in T3), states, and times. `features/customer/tickets/` holds the data, actions (`createTicket` opens the new ticket; `returnTicket` goes to the cart or stays), `qr.ts` (the QR as a server-drawn SVG through the new `qrcode` package), and components.
  - Cart: the orange "Get my ticket" replaces the not-yet note, and a row names an open ticket. Orders: tickets join the list. DESIGN.md has a Counter tickets section.
  - Tested in PGlite against all 29 migrations with Supabase's default grants: 56 checks (25 cart, 31 tickets: codes, capping, what stays in the cart, RLS for customers and staff, direct writes denied, folding, returning, expiry, deleted variants, anon, re-running). Code normalization checked separately. Screens checked through a temporary preview (deleted), and the QR decodes to its code in light, dark, and on a phone.
- **Left for T3:** linking a sale to its ticket and marking it paid (the `paid` status is ready for it), and what voiding that sale does to the ticket.

### Phase T3: Load a ticket at the counter (staff)
- "Load ticket" in the POS: type the code or scan the QR. Its lines fill the POS cart, and anything that changed (sold out, short, price change, removed item) is flagged.
- Charging links the sale to the ticket and marks the ticket paid. An expired, cancelled, or already-paid ticket is refused with a clear message.
- The customer's ticket shows "Paid" and links to its receipt.
- **Done when:** a ticket goes from customer to POS to a paid sale, a ticket can't be charged twice, and voiding the sale is handled.
- **Decided (2026-11-09):** scanning is the live camera with a photo as backup (Vercel serves https, which the camera needs), and typing the code or a USB scanner always works. A sale that already has items asks "replace or add". Voiding a ticket's sale reopens the ticket (it reads as expired once its 3 days are up). The customer's bell says when the ticket is paid and opens it, with the receipt on the ticket page.
- **Built (2026-11-09, uncommitted):**
  - Migration `20261025000000_ticket_sales.sql`: `counter_tickets.sale_id`; `rpc('create_ticket_sale', ticket, items, payments, key)` checks the ticket is open and not expired, records the sale through `create_pos_sale`, marks the ticket paid, and notifies the customer, in one step (a retried Charge with the same key returns the same sale; refusals carry DETAIL `ticket:<state>`); voiding the sale reopens the ticket and tells the customer; customers read the sale, lines, and payments of their own paid ticket; `counter_tickets` joins realtime.
  - POS (`features/admin/pos`): `loadTicket(code)` and `createSale(..., ticketId)` in `actions.ts`; `ticket.ts` merges a ticket into the sale at most what's on the rack and notes what changed; `components/pos-ticket-scan.tsx` (camera viewfinder through the new `jsqr` package, loaded on first open, photo fallback) and `components/pos-ticket.tsx` (the ticket chip and the replace-or-add sheet). The ticket is kept with the sale in the tab (sessionStorage) and goes with Clear or the last item.
  - Customer: the bell's `ticket` type opens the ticket; a paid ticket's page shows the receipt (`fetchTicketReceipt`); the ticket page and Orders follow `counter_tickets` live.
  - Tested in PGlite against all migrations: 80 checks (22 for ticket sales: only staff charge; charging marks it paid, takes stock, and notifies once; a retry returns the same sale; a second charge, an expired, a cancelled, and an unknown ticket are refused; a refused payment leaves the ticket open; voiding reopens it, notifies, and it can be charged again; the customer reads their receipt and no one else's). Screens checked through a temporary preview (deleted), including the fake camera feed.
- **Not done:** the admin receipt doesn't name the ticket it paid.
