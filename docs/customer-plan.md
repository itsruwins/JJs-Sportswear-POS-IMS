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
  - `requireCustomer()` in `features/customer/shell/session.ts` guards every page. Staff and owners who open a customer page go to `/admin`; customers who open `/admin` go to `/shop`.
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
- **Decided 2026-10-07:**
  - **Look:** Nike/Adidas-style layout in the J&J world.
  - **Shop tab:** opens on a featured product, then a "Shop by sport" rail, then the full grid.
  - **Cards:** photo first, with name, category and color count, and price. Stock appears on the product page, as exact pieces left.
  - **Filters:** search, sport chips, size (products with that size in stock), in stock only, and sort, all kept in the URL.
  - **Product page:** "Buy at the shop" opens a sheet with the chosen size and color and the shop details. The details are marked placeholders from `lib/shop.ts`. "Make a custom version" is wired in C3.
  - **Images:** sample illustrations are recolored to each variant's color.
  - **Featured product:** the owner tags a product "featured" in the admin; otherwise the first jersey in stock leads.
- **Built 2026-10-07:**
  - Routes `/shop` and `/shop/[id]`, with views in `features/customer/shop/components/`.
  - `features/customer/shop/model.ts` holds the client-safe filters and categories. `features/customer/shop/data.ts` loads the catalog on the server.
  - `features/customer/design/sample-art.ts` turns the sample SVGs into recolorable art.
  - Stock updates live through Realtime on products and variants.

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
- **Decided 2026-10-07:**
  - **Garments:** a fixed list plus "Other", typed in.
  - **Sizes:** a size run per garment under a fit switch (Adult / Women's / Kids / One size), saved as one line per size.
  - **Extra fields:** needed-by date, team name, names and numbers (per-garment notes), and up to 3 reference pictures. The owner sees them on the admin order page.
  - **Form:** three steps, Details → Garments → Review.
  - **Editing:** edit everything or cancel until the shop accepts.
  - **"Make a custom version":** pre-fills the garment and color.
- **Built 2026-10-07:**
  - **Migration:** `20261013000000_customer_order_requests.sql` adds the team name, needed-by and reference-image columns; the private `order-references` bucket; and `rpc submit_custom_order` / `update_custom_order`, which save the order and its lines in one transaction. The user has applied it.
  - **Customer routes:** `/orders`, `/orders/new`, `/orders/[id]`, `/orders/[id]/edit`.
  - **Admin:** the order page and the orders list show the team, the needed-by date, and the pictures.
  - **Tested end to end** with test customer `c3.test`, approved by the user. Its two test orders (CO-20261007-00010 and -00011) are cancelled; delete the account in Supabase Auth if you want it gone.

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

- **Decided 2026-10-07:**
  - **GCash details:** marked placeholders in `lib/shop.ts`: name, number, and an optional QR image.
  - **Paying:** a modal (bottom sheet on phones) with amount chips, an amount up to what's due, a 13-digit reference, and a required screenshot.
  - **Tracking:** production steps, status history, finished photos, and a payment summary.
  - **Amber:** only for "action needed" (the down payment after acceptance, the balance when ready).
  - **Reprints:** shown plainly.
- **Built 2026-10-07:**
  - `/orders/[id]` gets an action notice, Production (with reprint events), Finished photos, Price and payments (with pay button), Pickup, and History. It updates live from the order tables.
  - The `/orders` list splits into "In progress" and "Past orders", with amber pay pills.
  - Customers send GCash payments through `submitPayment` (server action, re-checks what's due), saved as "submitted" for the shop to verify.
  - **Seed:** `supabase/seed/sample-customer-orders.sql` (username at the top), removed with `remove-sample-customer-orders.sql`. It was run for `c3.test`, and one test GCash payment was submitted on its "Mayon Blazers (sample)" order.

### Phase C5: AI design studio (simulated)
- Write a prompt, generate, and see the result. Every attempt is saved to `ai_designs` with its attempt number for the day.
- A gallery of past designs.
- "Use this design" starts a custom order request with the design attached.
- Sample design images ship in `public/`, marked for replacement by a real provider.
- **Done when:** a design goes from prompt to an attached custom order request.

- **Decided 2026-10-07:**
  - **AI:** FLUX.2 [pro] from Black Forest Labs (research: `docs/ai-design-studio-model-research.pdf`).
  - **Limit:** 3 designs per customer per day; refines count, failed generations don't.
  - **Input:** guided picks plus free text, and an optional logo as a FLUX reference.
  - **Image:** front and back side by side.
  - **Refine:** allowed, and it counts toward the limit.
  - **"Use this design":** starts a request with the design attached.
  - **Until the key exists:** a labelled preview mode using the shop's sample art.
- **Built 2026-10-07:**
  - `/design` studio, at `features/customer/design/components/studio.tsx`.
  - Server actions `generateDesign` and `refineDesign`.
  - FLUX client in `features/customer/design/flux.ts`; it polls the result and copies it into the private `ai-designs` bucket.
  - Preview renderer in `features/customer/design/preview-art.ts` (sharp, SVG to WebP).
    - Lettering is drawn as Archivo outlines from `assets/fonts/` (SIL OFL, via the `opentype.js` package), so previews look the same on any server.
  - Preview mode has no Refine: previews can't redraw from words, and the server refuses a refine until the FLUX key is set, so no try is spent.
  - Before the first design, the stage shows the sample garment in the picked colors, and it recolors as you pick.
  - The picks, including the logo, come back from the last design.
  - Migrations:
    - `20261014000000_ai_design_studio.sql`: details, parent_id, is_preview, and the 3/day trigger. The user has applied it.
    - `20261014120000_ai_designs_keep.sql`: no deletes, so tries can't be refunded. Not applied yet; run it in Supabase.
  - Requests carry `ai_design_id`, and the order page shows the design.
- **Turning FLUX on:**
  - Add `BFL_API_KEY=...` to `.env.local` (and to the hosting environment), then restart the server.
  - Optional: `BFL_MODEL` picks the endpoint (default `flux-2-pro`).
  - Preview designs made earlier stay marked "Preview".
- **FLUX turned on (2026-11-14):**
  - The key is in `.env.local` (`BFL_API_KEY`, `BFL_MODEL=flux-2-pro`). It still has to be added to the hosting environment (Vercel) before the live site can generate.
  - **Look:** modelled on the shop's FLUX.2 samples in `../Files/` (Thunder, Star, Eagle, Storm): a 3D ghost-mannequin garment, front on the left and back on the right, soft shadow, plain off-white background.
  - **Shape lock:** seven white blanks made once with FLUX.2 [pro] live in `public/design-blanks/` (`tank-nba`, `tank-regular`, `tee-v`, `shirt`, `polo`, `jacket`, `hoodie`). Each new design sends its shape's blank as image 1 (inline base64, so it works on localhost), with the logo as image 2. `garmentShape()` in `model.ts` picks the blank: basketball jerseys follow the cut, running jerseys use the regular tank, other jerseys the V-neck tee. `next.config.ts` traces the folder into the `/design` route.
  - **New picks:** NBA or regular cut (basketball jerseys), "number on the front too", an exact color picker (stored as `#RRGGBB`; swatch names go to FLUX as their palette hex), and four styles from the samples: angular shards, brush strokes, paint fade, half and half.
  - **Prompt:** written to BFL's FLUX.2 guide: subject first, colors as hex tied to parts (body, pattern, trim), exact text in quotes, team and player names over 4 letters also spelled out letter by letter (without it FLUX wrote "MAYYON"), and lettering colors picked for contrast. Prompt upsampling is off (`disable_pup`) so FLUX doesn't reword names.
  - **Cost:** output is 1184×784 (just under 1 MP). On pro a design costs 4.5 credits, or 6 with a logo; a refine is 4.5 (it sends only the design, not the logo). 1 credit is $0.01.
  - **Credits used in setup:** 43.5 of 1,000 (24 for the blanks, 19.5 for four test designs). Tests passed: basketball NBA cut with shards, volleyball with paint fade and a hex color, and regular cut with brush strokes and a logo. Spelling and logo placement were right.
  - **Landing page (2026-11-14):** the AI studio band is now "Pick it. See it on a jersey." with three real studio designs in `public/landing/` (`studio-shards`, `studio-fade`, `studio-brush`; backgrounds removed with macOS Vision subject lifting, transparent WebP with a CSS drop shadow), each shown with the picks that made it; tapping one cross-fades the picture. "Try the AI studio" goes to `/design` for customers, opens sign-up for visitors (then lands on `/design` through `openAuth`'s new `next` argument), and is hidden for staff. The drawn `Jersey` SVG was removed from `features/landing/components/garments.tsx`.

### Phase C6: Chat
- One general conversation with the shop, plus order-tagged messages, which can also be started from an order page or a product's "Ask about this".
- Live messages, unread counts on the dock, and read receipts handled by the database.
- **Done when:** a customer message shows in the admin chat inbox and the owner's reply appears live for the customer.

- **Decided 2026-10-07:**
  - **Placement:** a chat bubble floating bottom-right on every customer page (above the dock on phones), opening a chatbot-style panel. A person always answers. The Chat tab leaves the dock and top nav, so the dock is Shop, Orders, Design, Account.
  - **Chatbot feel:** a greeting from J&J Sportswear with the shop's hours (placeholder 8am–6pm), and quick-reply chips ("Ask about my order", "Sizes and prices", "Custom order help") that send real messages to the shop.
  - **Orders:** one conversation. "Ask about this order" (and the product page's "Ask about this") opens the panel with a removable tag on the next message; tagged messages show the order code.
  - **Photos:** customers can send photo messages. This needs a migration (an attachment column and a private bucket) and photo support in the owner's admin inbox.
- **Built 2026-10-07:**
  - Chat widget at `features/customer/chat/components/chat-widget.tsx`, mounted in the customer layout. `/chat` now redirects to `/shop?chat=open`, which opens the panel.
  - Server actions `sendChatMessage` and `markChatRead` in `features/customer/chat/actions.ts`; data helpers in `features/customer/chat/data.ts`. Live updates come from Realtime on `chat_messages`, with a check on tab focus and every minute as a fallback.
  - "Ask about this order" on order pages and "Ask the shop about this" on product pages (`features/customer/chat/components/ask-shop.tsx`).
  - The admin inbox shows and sends photos; a photo-only message reads "Sent a photo" in alerts and the inbox list.
  - Migration `20261015000000_chat_photos.sql`: `chat_messages.image_path`, the private `chat-photos` bucket, and its policies. Not applied yet; run it in Supabase.
  - The greeting uses `SHOP.hours` once it's filled in (`lib/shop.ts`); until then it says "usually the same day".
  - Test cleanup: `supabase/seed/remove-c6-test-messages.sql` removes the messages the C6 checks sent as c3.test.

### Phase C7: Notifications + account
- Bell with the customer's notifications: order status, payment verified or rejected, and new messages. Each one opens what it's about.
- Account page:
  - Full name, phone, and optional email.
  - Profile photo (the `avatars` bucket).
  - Change password.
  - Log out.
- **Done when:** every automatic notification reaches the customer and opens the right screen.

- **Decided 2026-10-07:**
  - **Bell:** in the top bar on every size, with an amber unread count. It opens a list (a sheet on phones) with "Mark all read", and new notifications pop up briefly in the corner as they arrive, like the admin's bell.
  - **Chat:** shop messages stay in the chat bubble only; the bell covers orders, payments, and refunds.
  - **Opens to:** a status notification opens its order page; a payment or refund notification opens it scrolled to "Price and payments". Tapping marks it read.
  - **Account:** customers can edit name, phone, and email (the username stays fixed), add or remove a profile photo (cropped square), and change their password (current password first).
  - **Photo for the shop:** the customer's photo also shows in the owner's chat inbox and order pages.
- **Built 2026-10-07:**
  - Bell: `features/shared/ui/notification-bell.tsx` gained `variant="customer"` (no chat alerts; status → `/orders/<id>`, payment and refund → `/orders/<id>#payments`), mounted in the customer top bar.
  - Account page: `features/customer/account/components/account-view.tsx`, with server actions `saveDetails`, `changePassword`, `setPhoto`, and `removePhoto` in `features/customer/account/actions.ts` and the rules in `features/customer/account/validation.ts`. The current password is checked on a separate client that keeps no session.
  - Profile photos: cropped to 512px square WebP in the public `avatars` bucket (older ones are cleared). They show in the top bar, on Account, and in the owner's chat inbox, conversation header, and order page.
  - No migration needed.
  - Sample notifications for trying the bell: `supabase/seed/sample-customer-notifications.sql` (remove with `remove-sample-customer-notifications.sql`).

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
