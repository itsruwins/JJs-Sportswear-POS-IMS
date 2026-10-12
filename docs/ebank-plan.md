# E-bank payments and receipt scanning plan

One phase per session. Each phase ends finished and tested, and the next one starts only after you approve it.

Goal: the counter takes cash and e-payments from GCash, Maya, MariBank, UnionBank, GoTyme Bank, BDO, BPI, and Metrobank, in any mix. The cashier photographs the customer's receipt, Google Gemini reads it, and the cashier checks the result before charging. The sale itself, its items, and the stock deduction keep going through the one database function they use today.

## Decisions (2026-10-12)

- **Amount on the receipt ≠ amount due:** blocked. The owner can override it with a written reason.
- **Payments:** exact, overpaid, or split. Anything paid above the total comes back as cash change. Splits take any mix of cash and e-payments. At most one cash part, and 50 parts in all as a guard.
- **Duplicate reference:** a hard block, per provider. Voided sales don't count.
- **Receipt not dated today:** a warning the cashier confirms before charging.
- **Verification:** e-payments are saved as `cashier_confirmed`. Nothing checks the bank, so nothing is called "verified". The owner can later mark each one `matched` or `disputed`.
- **Receipt photos:** kept 90 days in a private bucket that only staff and the owner read, then deleted.
- **Custom-order payments:** they get the same providers (a later phase).
- **Gemini:** free tier for now (`GEMINI_API_KEY` in `.env.local`, server only). On the free tier, Google may use the images to improve its products. Moving to a paid key before real customers' receipts go through is recommended.
- **Devices:** tablets and phones take the photos, through the phone's own camera (a file input with `capture`). That also works over a local network address without HTTPS.
- **Scan limit:** none per cashier. Gemini's own quota is the cap.
- **Integration:** plain `fetch` to the Gemini API, the same pattern as `features/customer/design/flux.ts`. No new package.
- **Reference rules:** one per provider, stored in `payment_providers`, so they change without code. GCash is the confirmed 13 digits. The others take 6–40 letters and digits (spaces and dashes removed) until a real receipt confirms their format.
- **Old GCash sales:** backfilled into the new model as e-payment · GCash.
- **Reports:** Cash and E-payment at the top, with a per-provider breakdown on screen and in the CSV.
- **Provider settings:** owner only, in the database now. A small settings screen comes later.

## Phases

### Phase E1: Payment model
- `payment_providers` and `sale_payments`, `create_pos_sale` with payment parts, `void_pos_sale` freeing references, the backfill, and `sales_report` per provider.
- POS: a Cash / E-payment toggle, a provider picker, and a reference field (one e-payment of the exact total). The split-payment screen comes in E2.
- Sales list, receipt, Sales figures, the report, and the CSV show the provider and each payment part.
- **Done when:** a cash sale and an e-payment sale with each provider record correctly, a reused reference is refused, a void frees it, and the report adds up.
- **Built 2026-10-12:**
  - Migrations `20261016000000_e_payment_methods.sql` (new enum values; it has to run alone first) and `20261016120000_e_payments.sql`.
  - `features/shared/payments/` holds the provider types, reference clean-up and checks, and `fetchProviders`. It's shared because custom orders will use it.
  - `createSale(items, payments, requestId)`. Before the update runs, a single cash or GCash payment still goes through the old function.
  - Sales reads step back to older columns when the database hasn't had the update.
  - Cash in totals is the rest of the sales total after e-payments, so an e-payment above the total shows as cash paid out in change. Cash + E-payment always equals the total.
  - Tested in PGlite against every migration in order: 50 checks covering the backfill, re-running, references, splits, change, retries, voids, RLS, provider rules, and the report.

### Phase E2: POS payment panel design
- Designed with `/impeccable` and `/apple-design`, approved before it's built.
- Split payments: add parts, see the amount still due, and see the change.
- The capture and upload step, the review form, and every state: no receipt, permission denied, unavailable, captured, analyzing, read, partly read, unreadable, service error or quota, missing reference, amount mismatch, duplicate, awaiting check, rejected, and done. Scanning is stubbed until E3.
- **Decisions (2026-10-12):** a payment list, the scan in a sheet over the sale, provider first and then the scan, and sample results in development only.
- **Built 2026-10-12:**
  - **Sale panel** (`components/pos-payments.tsx`):
    - Cash | E-payment stays the way in, and cash works exactly as before.
    - E-payment shows the provider chips, and a chip opens the sheet. Cash short of the total offers "Pay the rest by e-payment".
    - Once an e-payment is in: rows for each part (tap to reopen, × to remove), an optional cash row, then Still due, Change (cash), or Paid in full, and Add payment.
    - Charge follows the same rules as the database. It names why it can't run, including cash on top of e-payments that already cover the total.
  - **Sheet** (`components/pos-scan-sheet.tsx`):
    - Built on the auth dialog: a bottom sheet on phones, a wide dialog from 640px.
    - Steps: photograph (the phone's own camera, or upload a screenshot), preview (Read receipt or Retake), reading (Cancel works), and review.
    - Review shows the reference and amount, plus the date, time, and status when read. Each field is marked from the receipt, check this, not on the receipt, or changed by hand.
    - Review notes sit in one panel, edged amber while something needs the cashier:
      - Information only: covers part of the total, over the total (cash change), and an amount that differs from the receipt.
      - Needs a tick: another provider's receipt (with Switch), dated before today, and Pending.
      - Stops the payment: Failed, and a reference already used.
    - Failures (unreadable, file, over the limit, unavailable) each offer Retake and Type the details.
    - A tap outside closes the sheet only before there's a photo.
    - Photos stay in this tab as blob URLs and are never saved with the sale in progress.
  - **Model:** `scan.ts` holds the result types and review rules that E3 and E4 reuse. `scan-demo.ts` holds sample results for development only, marked DEMO. In production, Read receipt says reading isn't available yet and offers typing.
  - **Amounts:** an amount the receipt doesn't show is left empty rather than guessed. A changed amount shows the receipt's figure; the owner override comes in E4.
  - **Checked:** screenshots on phone, tablet, and desktop, light and dark, and all 11 sample results, with no console errors. The design detector found only advisory font sizes, the same steps the POS already uses.

### Phase E3: Gemini receipt reading
- A `scanReceipt` server action behind `requireStaff`, with file type and size checks and resizing.
- The Gemini call with a JSON schema and a short prompt that treats receipt text as data. The server checks every field it returns.
- A timeout, at most one retry, and clear quota and outage messages. A failed scan keeps the cart and payment.
- Receipt photos go to a private bucket with a 90-day cleanup.
- A scan log: who, when, outcome, the fields read, and the model.
- **Decisions (2026-10-12):** `gemini-3.8-flash` first, then `gemini-3.5-flash-lite` when it's busy, slow, or over its limit. Every scanned photo is kept 90 days, and expired photos are cleared during scans.
- **Built 2026-10-12:**
  - **Migration** `20261017000000_receipt_scans.sql`:
    - `receipt_scans` logs every scan: who, the provider picked, the photo path, the outcome (read, not_receipt, unreadable, quota, failed), the model, the checked reading, and how long it took. Retakes and abandoned scans are logged too. `sale_id` waits for E4.
    - The private `pos-receipts` bucket holds the photos at `{scanned_by}/{random}.{ext}`. Staff and the owner read them, staff upload only into their own folder, and anyone on staff may delete a photo once it's 90 days old.
  - **`gemini.ts`:**
    - A plain `fetch` to `generateContent` (v1beta), with `responseMimeType` and `responseJsonSchema`. The newer `responseFormat.text` shape was refused for `application/json`.
    - Short instructions that treat text in the image as data.
    - The first model gets 12 s. Any failure hands over to the fallback (20 s) once, and nothing is retried beyond that.
    - Settings: `GEMINI_API_KEY`, `GEMINI_MODEL`, and `GEMINI_FALLBACK_MODEL` (set to `none` to turn the fallback off).
  - **`scanReceipt` action (`actions.ts`):**
    - Behind `requireStaff`.
    - The file's own first bytes must say JPG, PNG, or WebP, and it must be 4 MB or less (the action body limit is 5 MB in `next.config.ts`).
    - The provider must be on the active list.
    - The photo is stored before reading, so a failed read still leaves a record.
    - Every field is checked again in `checkReading` (`scan.ts`). Logs record only the kind of failure, never the photo, the reply, or the key.
    - Each scan clears up to 5 expired photos.
  - **Review:**
    - A "Sent to" row.
    - New notes: a photo that may be edited, or text in it giving instructions (needs a tick: "It matches the payment in the customer's app"); a blurry, glared, or cropped photo; more than one receipt in the photo.
    - "Not a receipt" is its own failure.
    - In development the result picker defaults to reading the photo with Gemini, and samples are still a pick away.
  - **Check this rule:** a field is marked "Check this" when the model's confidence is below 0.8, when the photo is blurry, glared, or cropped or has competing numbers (reference and amount), when the reference breaks its provider's rule, or when the status is unknown. The 0.8 is provisional until E6.
  - **Tested:**
    - 18 PGlite checks of the scan log and photo policies.
    - 27 unit checks of `checkReading` and the review rules.
    - Live reads of 8 synthetic receipts: clear GCash with leading zeros; BPI with a larger balance; Maya pending; UnionBank failed; injected instructions; a non-receipt; blur and glare; BDO amount with a fee. All 8 came back right, with the injection flagged suspicious and the blurry photo's fields marked "Check this". These are synthetic receipts, not real ones, and every read came from `gemini-3.5-flash-lite`: on 2026-10-12, `gemini-3.8-flash` either returned 503 (high demand) or ran past the wait. Reads took 5–15 s, mostly time spent waiting on 3.8 Flash before the fallback.

### Phase E4: Review rules and owner checks
- Extracted amount vs. the part's amount, with the owner override and its reason.
- A duplicate check at scan time, a warning for an old receipt date, and a warning when the provider doesn't match.
- Each sale links to the scan it used.
- The owner marks e-payments `matched` or `disputed` (in Payments, as decided below).
- **Decisions (2026-10-12):** the owner approves on the sheet by signing in there. Typed references are allowed but flagged for the owner. The owner checks counter e-payments in Payments, next to custom-order payments.
- **Built 2026-10-12:**
  - **Migration** `20261018000000_e_payment_checks.sql`:
    - `payment_overrides`: the owner's approval for one cashier, provider, reference, and amount, with a reason. One use, within 10 minutes. Only an owner's own session can write one.
    - `sale_payments` records how each e-payment was entered (`scan` or `typed`), its `scan_id`, what the receipt showed (amount and reference), and its `override_id`. Earlier e-payments are marked typed.
    - `create_pos_sale` accepts a scan only when it's the cashier's own, read successfully, under a day old, and not used before. A changed amount needs a matching override (`payment:<n>:needs_override`). The sale then claims its scans and overrides.
    - `check_sale_payment` (owner only): matched, disputed with a reason, or back to be checked.
  - **POS:**
    - At scan time, a reference already on a standing sale is refused before Charge, naming the sale.
    - A real scan whose amount was changed shows **Ask the owner to approve**. A staff cashier hands the device over: the owner's username and password are checked on a throwaway client with no session (the same way `changePassword` checks), and the approval is written as the owner. The cashier stays signed in.
    - The owner at the counter only gives a reason.
    - An approval stops counting if the amount, reference, or provider changes.
  - **Payments (owner):**
    - Custom orders | Counter e-payments, each with an amber count of what's waiting.
    - Counter e-payments has To check (oldest first, with anything flagged first), Matched, and Disputed.
    - Each row shows the receipt photo (signed link, 1 hour) or a typed mark, the provider and reference, the amount, a link to the sale, the cashier, and who it was sent to.
    - Flags: typed by hand; receipt amount and who approved the change, with their reason; reference changed; may be edited; receipt said Pending or Failed; receipt dated another day; blurry or glared photo.
    - Buttons: Matched, Disputed (with a reason), and Undo.
  - **Tested:** 22 PGlite checks covering typed and scanned entries, scan reuse, another cashier's scan, an unread scan, a junk id, a day-old scan, a changed amount with and without approval, an approval for the wrong amount or cashier, an expired or used approval, a forged approval row, and the owner's check, dispute, and undo. Screenshots of the approval panel (staff on tablet, owner on phone) and the owner's list (desktop and phone), with no console errors.

### Phase E5: Custom-order payments
- The customer pay flow and the owner's payment queue take the same providers and reference rules.
- **Decisions (2026-10-12):** the owner switches each provider on for online payment, and GCash starts on. The shop's accounts are kept in the database, with an owner screen to edit them. Gemini reads customers' screenshots for staff only.
- **Built 2026-10-12:**
  - **Migrations** `20261019000000_custom_order_e_payments.sql` and the follow-up `20261019120000_record_payment_type_fix.sql`.
  - **Providers:** `accepts_online`, account name and number, and a QR in the public `shop-accounts` bucket (the owner uploads it).
  - **Payments:** `provider` and `reference` on each payment. Old GCash payments become e_payment · GCash, and `gcash_reference` stays for history.
  - **Before a payment is written** (security definer): the reference is cleaned and checked against its provider's rule, and a reference on a standing counter sale is refused. Counter sales get the mirror trigger. A shared advisory lock per provider and reference keeps the two from racing.
  - **Database rules:**
    - Customers may send only an e-payment, through a provider that's online.
    - `record_custom_order_payment` now takes a provider and reference.
    - `verify_payment` takes e-payments with a reference.
    - `receipt_scans.payment_id` holds the reader's look at a screenshot, which can never pay for a counter sale.
    - Refunds are unchanged (cash or GCash).
  - **Customer pay sheet:** Pay with (the online providers), the shop's account for that provider (name, number with Copy, and QR, or "to follow"), the amount chips, the reference in that provider's form, and the screenshot. Payment rows read "Maya · ref …9B04". Without any online provider, customers are told to pay at the counter.
  - **Staff:**
    - Record a payment: Cash | E-payment, provider chips, the reference in its form, and an optional screenshot.
    - The review page names the provider and its reference.
    - **What the reader saw**: read once when the page opens and kept, with Read again. It shows amount, reference, and provider, each matching or differing from what the customer typed, plus status, date, who it was sent to, and any concerns.
    - The owner's **Shop accounts** page is linked from Payments (switch, name, number, QR, Save).
  - **Bug found and fixed:** the existing `record_custom_order_payment` inserted the payment type as text without a cast, so staff "Record a payment" could fail on the live database. The new function and the follow-up migration fix it.
  - **Tested:** 24 PGlite checks covering the backfill; GCash staying off when the migration is re-run; customer and staff e-payments; online-only providers; reference rules; duplicates in both directions between counter and orders; verify and reject; and screenshot readings. Screenshots of the pay sheet (phone), Record a payment (tablet), and Shop accounts (desktop and phone), with no console errors.

### Phase E6: Testing, security, docs
- Field-by-field accuracy on redacted sample receipts. None are available yet: the user provides them, and nothing is reported as tested until they've been run.
- Access tests for the scan action and the policies, and a regression pass on cash and the POS.
- Setup notes, configuration without secret values, and known limitations.
