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

### Phase E4: Review rules and owner checks
- Extracted amount vs. the part's amount, with the owner override and its reason.
- A duplicate check at scan time, a warning for an old receipt date, and a warning when the provider doesn't match.
- Each sale links to the scan it used.
- The owner marks e-payments `matched` or `disputed` from Sales.

### Phase E5: Custom-order payments
- The customer pay flow and the owner's payment queue take the same providers and reference rules.

### Phase E6: Testing, security, docs
- Field-by-field accuracy on redacted sample receipts. None are available yet: the user provides them, and nothing is reported as tested until they've been run.
- Access tests for the scan action and the policies, and a regression pass on cash and the POS.
- Setup notes, configuration without secret values, and known limitations.
