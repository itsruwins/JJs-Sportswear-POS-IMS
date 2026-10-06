# Customer build plan

One phase per session. Each phase ends finished, reviewed, and demoable, and the next one starts only after you approve it.

Sources: the manuscript (*Design-Driven Development of an Integrated POS and IMS for J&J Craft & Sportswear*, 2026) and the ERD documentation (*J&J Sportswear MVP*, 15 tables).

## What the documents ask for on the customer side

- **Manuscript, Scope:** customers register an account for secure access, browse clothing with real-time stock, check current stock levels, and send custom design requests.
- **Manuscript, Background:** customers check designs, sizes, and stock without messaging or visiting the shop, and they chat with the shop about products.
- **Manuscript, flowchart:** the shop confirms order details, finalizes the design, and asks for at least 50% down payment. Then come printing, cutting, sewing, and inspection (with a reprint if it's defective), then packing, the balance payment, and release.
- **ERD, customer-owned data:** `profiles`, `ai_designs`, `custom_orders` and `custom_order_items`, `payments` (GCash reference and screenshot), `chat_messages`, and `notifications`. Customers read `products`, `product_variants`, `product_images`, `product_tags`, `order_status_history`, and production steps.
- **ERD, not for customers:** `sales` and `sale_items` are counter (POS) sales only, so ready-made items have no online cart.

## Decisions (2026-10-07)

- **Sample data:** Supabase seed files in `supabase/seed`, labeled as samples and removable, the same as the admin. Customer screens read the real database, so changes in the admin show up for customers.
- **Access:** everything except the landing page sits behind login. The landing page's "Browse the shop" button sends visitors to sign up or log in first.
- **Ready-made products:** browse only. Customers check sizes, colors, and stock online and buy at the counter.
- **AI studio:** simulated. The full flow works (prompt, attempts saved in `ai_designs`, attach to an order), but the images come from a set of sample designs. A real provider plugs in later.
- **Release:** pickup only. "Ready" means ready for pickup at the shop.
- **Chat:** one general conversation with the shop, plus messages tagged to a specific order from that order's page.
- **Layout:** a phone-first app with its own shell. A bottom dock on phone (Shop, Orders, Design, Chat, Account) and a top nav on desktop, in the landing page's court-green world.
- **Pricing:** request, then quote. The customer sends garments, colors, sizes, quantities, notes, and an optional design. The owner accepts and sets `total_price`, then the customer pays at least 50% down. No price is shown up front.

## Already enforced by the database (no new migration needed)

- Customers insert only their own `pending` orders, and an attached AI design must be their own.
- Customers add, edit, and remove items only while their order is `pending`, and cancel through `rpc('cancel_custom_order')` while it's pending.
- Customers submit payments only on their own orders once the order is accepted. GCash proof goes to the private `payment-proofs` bucket.
- `ai_designs` attempts are numbered per customer per day (Asia/Manila) automatically.
- Chat: a customer writes to the shop (`receiver_id` null) or to an owner, optionally about their own order. Every owner reads shop messages.
- Status changes, payment verification, and new messages create notifications automatically.

## Phases

### Phase C1: Customer foundation
- Customer routes behind login. `proxy.ts` sends visitors without a session to log in, then brings them back.
- After logging in, customers land on `/shop` (staff and owners still go to `/admin`). The landing nav shows "Open shop" for signed-in customers.
- Customer shell:
  - Bottom dock on phone.
  - Top nav on desktop.
  - Account menu with log out.
- Empty states for tabs that come in later phases.
- **Done when:** a customer signs up, lands in the shop on phone, tablet, and desktop, and a logged-out visitor can't open any customer page.
- **Built 2026-10-07:**
  - Routes live in `app/(customer)`: `/shop`, `/orders`, `/design`, `/chat`, `/account`.
  - `requireCustomer()` in `lib/customer/session.ts` guards every page. Staff and owners who open a customer page go to `/admin`; customers who open `/admin` go to `/shop`.
  - `proxy.ts` sends logged-out visitors to the login sheet with `next=<page>` and brings them back after login.
  - The dock reuses the admin's dock styles. Desktop (1024px and up) moves Shop, Orders, Design, and Chat into the top bar, and Account into the avatar menu.
  - Unbuilt tabs say plainly what they'll hold. Shop shows a live count of products on the rack, and Account shows the profile read-only with Log out.
  - Also fixed: the login sheet didn't open after a redirect in dev (React's double effect run cleared `?auth=login` first). This affected `/admin` too.

### Phase C2: Shop catalog + product page
- Product grid using the sample catalog. Search by name or tag, filter by size, color, and in stock.
- Product page:
  - Photos.
  - Description and price.
  - A size × color availability grid with stock left, updating live as the counter sells (realtime is already on).
- "Buy at the counter" guidance with the shop's pickup details (placeholders until real ones arrive).
- "Ask about this" opens chat (wired up in C6).
- **Done when:** a customer can tell in seconds whether their size and color is in stock.

### Phase C3: Request a custom order
- Request form:
  - Description of the order.
  - Garment lines: garment type, color, size, quantity, and notes. Add as many as needed.
  - Overall notes.
  - An optional AI design (attaching one goes live in C5).
- Review before sending, with a clear confirmation and an order number.
- Edit or cancel while the order is still pending.
- Seed: sample custom orders for a sample customer account.
- **Done when:** a customer sends a multi-item request and sees it as pending.

### Phase C4: My orders + tracking + payments
- Orders list with status tabs (Pending, In progress, Ready, Done, Closed).
- Order page:
  - The order's journey: status history plus production steps (printing, cutting, sewing, inspection, packing), including reprints.
  - The quote, or the decline reason.
  - The finished photo and pickup details once it's ready.
- Payments:
  - Down payment of at least 50% once accepted, and the balance before pickup.
  - GCash (reference number plus screenshot upload) or "pay cash at the shop".
  - Status (submitted, verified, or rejected with its reason) and resubmitting a rejected payment.
  - The shop's GCash details are placeholders.
- Live updates as the shop moves the order.
- **Done when:** a customer follows a sample order from quote to pickup and submits a GCash down payment that the owner can verify in the admin.

### Phase C5: AI design studio (simulated)
- Write a prompt, generate, and see the result. Every attempt is saved to `ai_designs` with its attempt number for the day.
- A gallery of past designs.
- "Use this design" starts a custom order request with the design attached.
- Sample design images ship in `public/`, marked for replacement by a real provider.
- **Done when:** a design goes from prompt to an attached custom order request.

### Phase C6: Chat
- One general conversation with the shop, plus order-tagged messages, which can also be started from an order page or a product's "Ask about this".
- Live messages, unread counts on the dock, and read receipts handled by the database.
- **Done when:** a customer message shows in the admin chat inbox and the owner's reply appears live for the customer.

### Phase C7: Notifications + account
- Bell with the customer's notifications: order status, payment verified or rejected, and new messages. Each one opens what it's about.
- Account page:
  - Full name, phone, and optional email.
  - Profile photo (the `avatars` bucket).
  - Change password.
  - Log out.
- **Done when:** every automatic notification reaches the customer and opens the right screen.

## Left open for the phase where it matters

- **C2:** what a product card shows first (photo vs. stock), and the placeholder shop details.
- **C3:** the garment type list (jersey, shorts, shirt, and so on) and whether sizes use the admin's standard list.
- **C4:** the shop's GCash name and number placeholder, and whether cash payments are recorded by the customer or only by staff.
- **C5:** a daily attempt limit for AI generations, if any.

## Hardening to consider (deferred)

- **API-level lock for logged-out visitors:** RLS still lets the `anon` role read active products, variants, images, and tags. Customer pages are gated in the app, but a follow-up migration can move those reads to `authenticated` if the catalog must be private at the data level too. Check first that nothing on the landing page reads them.

## How each phase runs

1. A short round of questions, only on what that phase leaves open.
2. Build, then check in the browser at desktop, tablet, and phone sizes, in light and dark (/impeccable and /apple-design).
3. Independent review, fixes, and a short report of what changed and how to try it.
4. Your approval before the next phase starts.
