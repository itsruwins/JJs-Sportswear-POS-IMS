import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { formatPeso } from "@/features/shared/catalog/catalog";
import { FlipText } from "@/features/shared/ui/flip-text";
import { ticketState, ticketTime, type TicketState } from "@/features/shared/tickets/model";
import { pageShell } from "@/features/customer/shell/components/page-parts";
import { SectionTitle, ShopDetails } from "@/features/customer/cart/components/cart-parts";
import { piecesLabel } from "@/features/customer/cart/model";
import type { Ticket, TicketLine, TicketReceipt } from "@/features/customer/tickets/data";
import { TicketActions, TicketPill } from "./ticket-parts";

/** The line under the title: what this ticket is for now, in a sentence. */
function lead(t: Ticket, state: TicketState) {
  switch (state) {
    case "ready":
      return `Show it at the counter by ${ticketTime(t.expiresAt)}. Staff scan the code, pull your sizes, and you pay there.`;
    case "expired":
      return `It ran out on ${ticketTime(t.expiresAt)}. Put its items back in your cart to make a new one.`;
    case "cancelled":
      return `You cancelled it${t.closedAt ? ` on ${ticketTime(t.closedAt)}` : ""}. Its items went back to your cart.`;
    case "replaced":
      return "Its items moved onto your newer ticket, so this code no longer works.";
    case "paid":
      return `Paid at the counter${t.closedAt ? ` on ${ticketTime(t.closedAt)}` : ""}. Thanks for shopping with us.`;
  }
}

/** A line's stock now, said only when it no longer covers the ticket. */
function stockNote(l: TicketLine) {
  if (l.stockNow === null) return "No longer sold. Staff will take it off at the counter.";
  if (l.stockNow <= 0) return "Sold out since. Staff will take it off at the counter.";
  if (l.stockNow < l.quantity) return `Only ${l.stockNow} left now.`;
  return null;
}

const variantOf = (size: string | null, color: string | null) => [size, color].filter(Boolean).join(" · ");

/** What the counter rang up, on a paper slip: the lines as charged, the total, and how it was paid. */
function ReceiptSlip({ receipt: r }: { receipt: TicketReceipt }) {
  const rule = "border-t border-dashed border-[color-mix(in_oklch,var(--card-ink)_28%,transparent)]";
  // The slip is paper in both themes, so its quiet text is mixed from its own ink, not the page's.
  const quiet = "text-[color-mix(in_oklch,var(--card-ink)_64%,transparent)]";
  return (
    <div className="rounded-2xl bg-card px-5 py-5 text-card-ink shadow-[0_1px_2px_oklch(0_0_0/0.08),0_8px_24px_-16px_oklch(0_0_0/0.25)] sm:px-6">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[0.875rem]">
        <dt className={quiet}>Receipt no.</dt>
        <dd className="tabular text-right font-semibold">{r.receiptNumber}</dd>
        <dt className={quiet}>Paid</dt>
        <dd className="tabular text-right">{ticketTime(r.paidAt)}</dd>
      </dl>
      <ul className={`mt-4 ${rule}`}>
        {r.lines.map((l) => (
          <li key={l.key} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-[0.9375rem] font-semibold leading-snug">{l.name}</p>
              <p className={`tabular mt-0.5 text-[0.875rem] ${quiet}`}>
                {variantOf(l.size, l.color) && `${variantOf(l.size, l.color)} · `}
                {l.quantity} × {formatPeso(l.price)}
              </p>
            </div>
            <p className="tabular shrink-0 text-[0.9375rem] font-semibold">{formatPeso(l.subtotal)}</p>
          </li>
        ))}
      </ul>
      <div className={`flex items-baseline justify-between gap-3 pt-3.5 ${rule}`}>
        <p className="font-semibold">Total</p>
        <p className="voice-board tabular text-[1.5rem] leading-none">{formatPeso(r.total)}</p>
      </div>
      <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-[0.875rem]">
        {r.payments.map((p) => (
          <div key={p.key} className="contents">
            <dt className={`min-w-0 truncate ${quiet}`}>
              {p.label}
              {p.reference && <span className="tabular"> · Ref {p.reference}</span>}
            </dt>
            <dd className="tabular text-right">{formatPeso(p.amount)}</dd>
          </div>
        ))}
        {r.change > 0 && (
          <>
            <dt className={quiet}>Change</dt>
            <dd className="tabular text-right">{formatPeso(r.change)}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

/**
 * A counter ticket: the code on a piece of the scoreboard with its QR, the lines it holds,
 * the estimated total, and what the customer can still do with it. Once paid, the receipt
 * takes the place of the lines.
 */
export function TicketView({ ticket: t, qr, now, receipt }: { ticket: Ticket; qr: string | null; now: number; receipt: TicketReceipt | null }) {
  const state = ticketState(t, now);
  const live = state === "ready";
  const paid = state === "paid" ? receipt : null;

  return (
    <div className={pageShell}>
      <Link href="/orders" className="press -ml-2 mb-5 inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-[0.9375rem] font-medium text-ink-2 hover:text-ink">
        <ChevronLeft aria-hidden="true" className="size-4" />
        Orders
      </Link>

      <header className="mb-8 sm:mb-10">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="voice-display text-[clamp(2.25rem,5vw,3.5rem)]">Counter ticket</h1>
          <TicketPill state={state} />
        </div>
        <p className="mt-3 max-w-[52ch] text-[1.0625rem] leading-relaxed text-ink-2">{lead(t, state)}</p>
      </header>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
        <div className="flex min-w-0 flex-col gap-12">
          {/* The ticket: the one piece of board on the page */}
          <section aria-label="Ticket code" className="board rounded-[1.75rem] p-5 text-board-ink sm:p-7">
            <div className={`flex flex-col gap-6 ${live && qr ? "sm:flex-row sm:items-center sm:justify-between" : ""}`}>
              <div className="min-w-0">
                <p className="voice-label text-[0.75rem] uppercase text-board-ink-2">{live ? "Show this at the counter" : "Ticket"}</p>
                <div className={`mt-3 ${live ? "" : "opacity-55"}`}>
                  <FlipText text={t.code} label={`Ticket code ${t.code.split("").join(" ")}`} className="text-[clamp(2.5rem,11vw,4rem)]" />
                </div>
                <dl className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[0.9375rem]">
                  <dt className="text-board-ink-2">{live ? "Good until" : state === "expired" ? "Ran out" : "Made"}</dt>
                  <dd className="tabular">{ticketTime(live || state === "expired" ? t.expiresAt : t.createdAt)}</dd>
                  <dt className="text-board-ink-2">Holds</dt>
                  <dd className="tabular">{piecesLabel(t.pieces)}</dd>
                </dl>
              </div>
              {live && qr && (
                <figure className="flex shrink-0 flex-col items-center gap-2 self-center">
                  <div className="rounded-2xl bg-card p-3.5 shadow-[0_1px_2px_oklch(0_0_0/0.2)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qr} alt={`QR code for ticket ${t.code}`} width={152} height={152} className="block size-[9.5rem] [image-rendering:pixelated]" />
                  </div>
                  <figcaption className="text-[0.8125rem] text-board-ink-2">Staff scan this</figcaption>
                </figure>
              )}
            </div>
          </section>

          {paid ? (
            <section aria-labelledby="ticket-receipt-title">
              <SectionTitle id="ticket-receipt-title">Receipt</SectionTitle>
              <div className="mt-3">
                <ReceiptSlip receipt={paid} />
              </div>
            </section>
          ) : (
            <section aria-labelledby="ticket-items-title">
              <SectionTitle id="ticket-items-title" aside={<span className="tabular text-[0.9375rem] text-ink-2">{piecesLabel(t.pieces)}</span>}>
                Items
              </SectionTitle>
              <ul>
                {t.lines.map((l) => {
                  const note = live ? stockNote(l) : null;
                  return (
                    <li key={l.position} className="flex items-start justify-between gap-4 border-b border-line py-3.5">
                      <div className="min-w-0">
                        <p className="text-[1rem] font-semibold leading-snug text-ink">{l.name}</p>
                        <p className="tabular mt-0.5 text-[0.9375rem] text-ink-2">
                          {[l.size, l.color].filter(Boolean).join(" · ")} · {l.quantity} × {formatPeso(l.price)}
                        </p>
                        {note && <p className="mt-1.5 text-[0.875rem] font-semibold text-ink">{note}</p>}
                      </div>
                      <p className="tabular shrink-0 text-[1rem] font-semibold text-ink">{formatPeso(l.quantity * l.price)}</p>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-12">
          <section aria-labelledby="ticket-total-title">
            <SectionTitle id="ticket-total-title">{paid ? "You paid" : state === "paid" ? "Ticket total" : "Estimated total"}</SectionTitle>
            <dl className="mt-1 text-[0.9375rem]">
              <div className="flex items-baseline justify-between gap-3 py-2.5">
                <dt className="font-semibold text-ink">Total</dt>
                <dd className="voice-board tabular text-[1.75rem] leading-none text-ink">{formatPeso(paid ? paid.total : t.total)}</dd>
              </div>
            </dl>
            <p className="mt-1 max-w-[38ch] text-[0.875rem] leading-relaxed text-ink-2">
              {paid
                ? `What the counter charged for ${piecesLabel(paid.lines.reduce((n, l) => n + l.quantity, 0))}, at the day’s prices.`
                : state === "paid"
                  ? "At the prices when the ticket was made. Your receipt has what you paid."
                  : `At the prices on ${ticketTime(t.createdAt)}. The counter charges the day’s price.`}
            </p>
            {(live || state === "expired") && (
              <div className="mt-6">
                <TicketActions ticketId={t.id} code={t.code} expired={state === "expired"} />
              </div>
            )}
          </section>

          {live && (
            <section aria-labelledby="ticket-shop-title">
              <SectionTitle id="ticket-shop-title">At the shop</SectionTitle>
              <ShopDetails />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
