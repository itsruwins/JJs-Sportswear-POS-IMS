import { Fragment } from "react";
import { formatPeso } from "@/features/shared/catalog/catalog";
import { formatReference } from "@/features/shared/payments/model";
import type { CounterOrder } from "@/features/admin/design-orders/data";
import { SHOP } from "@/lib/shop";

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(iso));
const day = (date: string) => new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const person = (p: CounterOrder["takenBy"]) => p?.full_name?.trim() || (p ? `@${p.username}` : "The shop");

/**
 * The order slip the buyer takes home: the receipt's paper (light in both themes, 80 mm roll or A4),
 * with the order number to bring at pickup, what was ordered, what's paid, and the balance due.
 */
export function OrderSlip({ order, change }: { order: CounterOrder; change: number }) {
  const designs = [...new Set(order.lines.map((l) => l.design))];
  const pieces = order.lines.reduce((s, l) => s + l.quantity, 0);
  const balance = Math.max(0, Math.round((order.total - order.paid) * 100) / 100);
  return (
    <article
      aria-label={`Order slip ${order.orderNumber}`}
      className="receipt relative mx-auto w-full max-w-[24rem] bg-card px-6 py-7 text-[0.875rem] leading-snug text-card-ink shadow-[inset_0_0_0_1px_var(--line)]"
    >
      <header className="text-center">
        <p className="voice-display text-[1.5rem] uppercase leading-none">{SHOP.name}</p>
        {SHOP.address && <p className="mt-1.5">{SHOP.address}</p>}
        <p className={SHOP.address ? undefined : "mt-1.5"}>{SHOP.city}</p>
        {SHOP.phone && <p className="tabular">{SHOP.phone}</p>}
        <p className="voice-kicker mt-3 text-[0.6875rem]">Order slip</p>
      </header>

      <dl className="receipt-rule mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 pt-4 text-[0.8125rem]">
        <dt className="opacity-70">Order</dt>
        <dd className="tabular text-right font-semibold">{order.orderNumber}</dd>
        <dt className="opacity-70">Date</dt>
        <dd className="tabular text-right">{when(order.createdAt)}</dd>
        <dt className="opacity-70">For</dt>
        <dd className="text-right">{order.buyerName}</dd>
        {order.buyerPhone && (
          <>
            <dt className="opacity-70">Phone</dt>
            <dd className="tabular text-right">{order.buyerPhone}</dd>
          </>
        )}
        {order.team && (
          <>
            <dt className="opacity-70">Team</dt>
            <dd className="text-right">{order.team}</dd>
          </>
        )}
        {order.neededBy && (
          <>
            <dt className="opacity-70">Needed by</dt>
            <dd className="tabular text-right">{day(order.neededBy)}</dd>
          </>
        )}
        <dt className="opacity-70">Taken by</dt>
        <dd className="text-right">{person(order.takenBy)}</dd>
      </dl>

      <ul className="receipt-rule mt-4 pt-3">
        {designs.map((d) => (
          <li key={d} className="py-1.5">
            <p className="font-semibold">{d}</p>
            <ul>
              {order.lines
                .filter((l) => l.design === d)
                .map((l) => (
                  <li key={l.id} className="tabular flex justify-between gap-3">
                    <span className="opacity-80">
                      {[l.style, l.size].filter(Boolean).join(" · ")} · {l.quantity}
                      {l.unitPrice !== null && <> × {formatPeso(l.unitPrice)}</>}
                    </span>
                    {l.unitPrice !== null && <span>{formatPeso(l.unitPrice * l.quantity)}</span>}
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ul>

      <div className="receipt-rule mt-3 pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold">
            Total <span className="font-normal opacity-70">· {pieces} {pieces === 1 ? "piece" : "pieces"}</span>
          </span>
          <span className="voice-board tabular text-[1.75rem] leading-none">{formatPeso(order.total)}</span>
        </div>
        <dl className="tabular mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
          {order.payments.map((p, i) => (
            <Fragment key={i}>
              <dt>Paid · {p.method === "cash" ? "Cash" : (p.providerName ?? "E-payment")}</dt>
              <dd className="text-right">{formatPeso(p.amount)}</dd>
              {p.reference && (
                <>
                  <dt className="opacity-70">Ref. no.</dt>
                  <dd className="text-right">{formatReference(p.provider ?? "", p.reference)}</dd>
                </>
              )}
            </Fragment>
          ))}
          {change > 0 && (
            <>
              <dt>Change</dt>
              <dd className="text-right">{formatPeso(change)}</dd>
            </>
          )}
          <dt className="mt-1.5 font-semibold">{balance > 0 ? "Balance at pickup" : "Fully paid"}</dt>
          <dd className="mt-1.5 text-right font-semibold">{balance > 0 ? formatPeso(balance) : formatPeso(order.paid)}</dd>
        </dl>
      </div>

      {order.notes && (
        <div className="receipt-rule mt-4 pt-3">
          <p className="font-semibold">Notes</p>
          <p className="mt-0.5 whitespace-pre-line opacity-80">{order.notes}</p>
        </div>
      )}

      <footer className="receipt-rule mt-5 pt-4 text-center text-[0.8125rem]">
        <p>Bring this slip, or the order number, when you pick up.</p>
        <p className="mt-1 opacity-70">{SHOP.notice}</p>
      </footer>
    </article>
  );
}
