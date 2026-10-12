import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { OrderFlash } from "@/components/admin/orders/order-actions";
import { personName, when } from "@/components/admin/orders/order-bits";
import { PrintButtons } from "@/components/admin/sales/receipt-actions";
import { formatPeso } from "@/features/shared/catalog/catalog";
import { methodLine, PAY_TYPE_LABEL, type PaymentDetail } from "@/lib/admin/payments";
import { formatGcashRef } from "@/lib/admin/sales";
import { SHOP } from "@/lib/shop";
import { ReviewPayment } from "./payment-actions";
import { PayPill } from "./payment-bits";

const round = (n: number) => Math.round(n * 100) / 100;
/** Recorded by staff at the counter: saved as verified in the same moment it was created. */
const atCounter = (p: PaymentDetail) => !!p.verified_at && Math.abs(Date.parse(p.verified_at) - Date.parse(p.created_at)) < 1000;
const verifierName = (v: PaymentDetail["verifier"]) => v?.full_name?.trim() || (v ? `@${v.username}` : "Someone");

/** One payment: check a customer's GCash payment, or print the slip for a verified one. */
export function PaymentView({ payment: p }: { payment: PaymentDetail }) {
  const total = p.order.total_price ?? 0;
  const due = round(total - p.paidBefore);
  const after = round(total - p.paidBefore - (p.status === "verified" ? p.amount : 0));
  const waiting = p.status === "submitted" || p.status === "pending";
  // A new or declined order never took money. A cancelled one can, so it counts toward the refund.
  const orderTakesMoney = p.order.status !== "pending" && p.order.status !== "declined";
  const cancelled = p.order.status === "cancelled";
  // Only a GCash payment the customer sent, with its reference, can be verified.
  const verifiable = p.status === "submitted" && p.method === "gcash" && !!p.gcash_reference;
  const over = waiting && orderTakesMoney && p.amount > due;

  return (
    <div className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10">
      <div data-print="hide">
        <Link href="/admin/payments" className="press inline-flex items-center gap-1.5 py-1 text-[0.9375rem] font-semibold text-ink hover:underline">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Payments
        </Link>

        <header className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="voice-display tabular text-[clamp(2rem,4.5vw,3rem)]">{formatPeso(p.amount)}</h1>
            <p className="mt-1.5 text-[0.9375rem] text-ink-2">
              {PAY_TYPE_LABEL[p.payment_type]} for{" "}
              <Link href={`/admin/orders/${p.order.id}`} className="tabular font-semibold text-ink hover:underline">
                {p.order.order_number}
              </Link>{" "}
              · {personName(p.order.customer)}
            </p>
          </div>
          <PayPill status={p.status} />
        </header>
        <OrderFlash orderId={p.id} />
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
        <div className="min-w-0">
          {waiting && (
            <section data-print="hide">
              <h2 className="voice-display border-b border-line pb-3 text-[1.5rem]">Check it</h2>
              <p className="mt-4 max-w-[60ch] text-[0.9375rem] text-ink-2">
                Find this reference in the shop’s GCash history and check the amount. Verifying counts it toward the order; rejecting tells the customer why.
              </p>
              <dl className="mt-4 grid max-w-[28rem] grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-[0.9375rem]">
                <dt className="text-ink-2">GCash reference</dt>
                <dd className="tabular text-right font-semibold text-ink">{p.gcash_reference ? formatGcashRef(p.gcash_reference) : "None given"}</dd>
                <dt className="text-ink-2">Order total</dt>
                <dd className="tabular text-right text-ink">{formatPeso(total)}</dd>
                <dt className="text-ink-2">Paid before this</dt>
                <dd className="tabular text-right text-ink">{formatPeso(p.paidBefore)}</dd>
                <dt className="font-semibold text-ink">{cancelled ? "Was still due" : "Still due"}</dt>
                <dd className="tabular text-right font-semibold text-ink">{formatPeso(due)}</dd>
              </dl>
              {!orderTakesMoney && (
                <p className="auth-alert mt-4 max-w-[36rem] rounded-xl px-4 py-3 text-[0.9375rem]">
                  This order was {p.order.status === "declined" ? "declined" : "never accepted"}, so the payment can’t be counted. Reject it and tell the customer why, and send the money back if it reached the shop.
                </p>
              )}
              {cancelled && orderTakesMoney && !over && verifiable && (
                <p className="mt-4 max-w-[36rem] rounded-xl bg-ground-2 px-4 py-3 text-[0.9375rem] text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]">
                  This order was cancelled. If the money reached the shop, verify it so it counts toward what the owner refunds; if not, reject it.
                </p>
              )}
              {waiting && !verifiable && orderTakesMoney && (
                <p className="auth-alert mt-4 max-w-[36rem] rounded-xl px-4 py-3 text-[0.9375rem]">
                  This payment wasn’t sent with a GCash reference, so it can’t be verified. Reject it and ask the customer to send it again.
                </p>
              )}
              {over && (
                <p className="auth-alert mt-4 max-w-[36rem] rounded-xl px-4 py-3 text-[0.9375rem]">
                  This is more than the {formatPeso(due)} still due, so it can’t be verified as is. Reject it and ask the customer to check the amount.
                </p>
              )}
              <div className="mt-5">
                <ReviewPayment paymentId={p.id} canVerify={orderTakesMoney && verifiable && !over} />
              </div>
            </section>
          )}

          {p.status === "rejected" && (
            <section className="rounded-2xl bg-ground-2 px-5 py-4 shadow-[inset_0_0_0_1px_var(--line)]" data-print="hide">
              <p className="text-[1rem] font-semibold text-ink">Rejected{p.verified_at ? ` ${when(p.verified_at)}` : ""}</p>
              <p className="mt-1 text-[0.9375rem] text-ink-2">Told the customer: “{p.rejection_reason}”</p>
            </section>
          )}

          {p.status === "verified" && (
            <section>
              <h2 data-print="hide" className="voice-display border-b border-line pb-3 text-[1.5rem]">
                Payment slip
              </h2>
              <div className="mt-6">
                <PaymentSlip payment={p} after={after} />
              </div>
              <div data-print="hide" className="mx-auto mt-6 grid max-w-[24rem] grid-cols-2 gap-2.5">
                <PrintButtons primary label="Print slip" />
              </div>
            </section>
          )}

          {p.proof_path && (
            <section className="mt-10" data-print="hide">
              <h2 className="voice-display border-b border-line pb-3 text-[1.5rem]">Screenshot</h2>
              {p.proofUrl ? (
                <a href={p.proofUrl} target="_blank" rel="noreferrer" className="group mt-4 block max-w-[24rem]">
                  {/* A signed link from the private payment-proofs bucket. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.proofUrl}
                    alt={`GCash screenshot for ${formatPeso(p.amount)}`}
                    className="max-h-[32rem] w-full rounded-2xl bg-[var(--photo-bg)] object-contain shadow-[inset_0_0_0_1px_var(--line)]"
                  />
                  <span className="mt-2 inline-flex items-center gap-1.5 text-[0.875rem] font-semibold text-ink group-hover:underline">
                    Open full size
                    <ExternalLink aria-hidden="true" className="size-3.5" />
                  </span>
                </a>
              ) : (
                <p className="mt-4 text-[0.9375rem] text-ink-2">The screenshot couldn’t be loaded. Refresh to try again.</p>
              )}
            </section>
          )}
        </div>

        <aside className="min-w-0" data-print="hide">
          <h2 className="voice-display border-b border-line pb-3 text-[1.5rem]">Details</h2>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[0.9375rem]">
            <dt className="text-ink-2">For</dt>
            <dd className="text-right text-ink">{PAY_TYPE_LABEL[p.payment_type]}</dd>
            <dt className="text-ink-2">Paid by</dt>
            <dd className="text-right text-ink">{methodLine(p)}</dd>
            <dt className="text-ink-2">{atCounter(p) ? "Received" : "Sent"}</dt>
            <dd className="tabular text-right text-ink">{when(p.created_at)}</dd>
            {p.verified_at && (
              <>
                <dt className="text-ink-2">{p.status === "rejected" ? "Rejected by" : atCounter(p) ? "Recorded by" : "Verified by"}</dt>
                <dd className="text-right text-ink">
                  {verifierName(p.verifier)}
                  <span className="tabular block text-[0.8125rem] text-ink-2">{when(p.verified_at)}</span>
                </dd>
              </>
            )}
            {p.note && (
              <>
                <dt className="text-ink-2">Note</dt>
                <dd className="text-right text-ink">{p.note}</dd>
              </>
            )}
            <dt className="text-ink-2">Order</dt>
            <dd className="text-right">
              <Link href={`/admin/orders/${p.order.id}`} className="tabular font-semibold text-ink hover:underline">
                {p.order.order_number}
              </Link>
            </dd>
          </dl>
        </aside>
      </div>
    </div>
  );
}

/** The slip a customer gets for a verified payment: paper in both themes, prints on an 80 mm roll or A4. */
function PaymentSlip({ payment: p, after }: { payment: PaymentDetail; after: number }) {
  return (
    <article
      aria-label={`Payment slip for ${p.order.order_number}`}
      className="receipt relative mx-auto w-full max-w-[24rem] bg-card px-6 py-7 text-[0.875rem] leading-snug text-card-ink shadow-[inset_0_0_0_1px_var(--line)]"
    >
      <header className="text-center">
        <p className="voice-display text-[1.5rem] uppercase leading-none">{SHOP.name}</p>
        {SHOP.address && <p className="mt-1.5">{SHOP.address}</p>}
        <p className={SHOP.address ? undefined : "mt-1.5"}>{SHOP.city}</p>
        {SHOP.phone && <p className="tabular">{SHOP.phone}</p>}
        <p className="mt-3 font-semibold">Custom order payment</p>
      </header>

      <dl className="receipt-rule mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 pt-4 text-[0.8125rem]">
        <dt className="opacity-70">Order</dt>
        <dd className="tabular text-right font-semibold">{p.order.order_number}</dd>
        <dt className="opacity-70">Customer</dt>
        <dd className="text-right">{personName(p.order.customer)}</dd>
        <dt className="opacity-70">{atCounter(p) ? "Date" : "Verified"}</dt>
        <dd className="tabular text-right">{when(p.verified_at ?? p.created_at)}</dd>
        <dt className="opacity-70">{atCounter(p) ? "Received by" : "Verified by"}</dt>
        <dd className="text-right">{verifierName(p.verifier)}</dd>
      </dl>

      <div className="receipt-rule mt-4 pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold">{PAY_TYPE_LABEL[p.payment_type]}</span>
          <span className="voice-board tabular text-[1.75rem] leading-none">{formatPeso(p.amount)}</span>
        </div>
        <p className="mt-1">{methodLine(p)}</p>
      </div>

      <dl className="receipt-rule tabular mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 pt-3">
        <dt>Order total</dt>
        <dd className="text-right">{formatPeso(p.order.total_price ?? 0)}</dd>
        <dt>Paid to date</dt>
        <dd className="text-right">{formatPeso(round((p.order.total_price ?? 0) - after))}</dd>
        <dt className="font-semibold">Balance</dt>
        <dd className="text-right font-semibold">{after > 0 ? formatPeso(after) : "Fully paid"}</dd>
      </dl>

      <footer className="receipt-rule mt-5 pt-4 text-center text-[0.8125rem]">
        <p>{SHOP.thanks}</p>
        <p className="mt-1 opacity-70">{SHOP.notice}</p>
      </footer>
    </article>
  );
}
