import { formatPeso, sortSizes } from "@/features/shared/catalog/catalog";
import { SectionTitle } from "@/features/customer/cart/components/cart-parts";
import { piecesLabel, runLabel } from "@/features/customer/cart/model";
import { StageStrip, StatusPill } from "@/features/customer/orders/components/order-parts";
import type { TicketOrder } from "@/features/customer/tickets/data";

/** One design and style with its sizes: how a design ticket and the order it made list their pieces. */
export type DesignRun = { key: string; name: string; style: string | null; lines: { size: string | null; quantity: number; price: number }[]; note?: string | null };

const each = (prices: number[]) =>
  Math.min(...prices) === Math.max(...prices) ? `${formatPeso(prices[0])} each` : `${formatPeso(Math.min(...prices))}–${formatPeso(Math.max(...prices))} each`;

/** Ruled rows, one per design and style: the size run, pieces and price each, and the run's total. */
export function DesignRuns({ runs }: { runs: DesignRun[] }) {
  return (
    <ul>
      {runs.map((r) => {
        const pieces = r.lines.reduce((n, l) => n + l.quantity, 0);
        return (
          <li key={r.key} className="flex items-start justify-between gap-4 border-b border-line py-4">
            <div className="min-w-0">
              <p className="text-[1rem] font-semibold leading-snug text-ink">
                {r.name}
                {r.style && <span className="font-normal text-ink-2"> · {r.style}</span>}
              </p>
              <p className="tabular mt-1 text-[0.9375rem] text-ink">{runLabel(r.lines.map((l) => ({ size: l.size ?? "One size", quantity: l.quantity })))}</p>
              <p className="tabular mt-0.5 text-[0.875rem] text-ink-2">
                {piecesLabel(pieces)} · {each(r.lines.map((l) => l.price))}
              </p>
              {r.note && <p className="mt-1.5 text-[0.875rem] font-semibold text-ink">{r.note}</p>}
            </div>
            <p className="tabular shrink-0 text-[1rem] font-semibold text-ink">{formatPeso(r.lines.reduce((n, l) => n + l.quantity * l.price, 0))}</p>
          </li>
        );
      })}
    </ul>
  );
}

/** The order's lines as runs, sizes in the shop's order (the counter may have changed them from the ticket). */
function orderRuns(o: TicketOrder): DesignRun[] {
  const runs = new Map<string, DesignRun>();
  for (const l of o.lines) {
    const key = `${l.name}|${l.style ?? ""}`;
    const run = runs.get(key) ?? { key, name: l.name, style: l.style, lines: [] };
    run.lines.push({ size: l.size, quantity: l.quantity, price: l.price });
    runs.set(key, run);
  }
  return [...runs.values()].map((r) => {
    const order = sortSizes(r.lines.map((l) => l.size ?? ""));
    return { ...r, lines: [...r.lines].sort((a, b) => order.indexOf(a.size ?? "") - order.indexOf(b.size ?? "")) };
  });
}

const day = (iso: string) =>
  new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }).format(new Date(iso));

/** The order a design ticket made (its number is on the ticket board): its status, where it is in the shop, and what the counter took. */
export function TicketOrderSection({ order: o }: { order: TicketOrder }) {
  const pieces = o.lines.reduce((n, l) => n + l.quantity, 0);
  const stopped = o.status === "cancelled" || o.status === "declined";
  return (
    <section aria-labelledby="ticket-order-title">
      <SectionTitle id="ticket-order-title" aside={<StatusPill status={o.status} />}>
        Your order
      </SectionTitle>
      {!stopped && (
        <div className="mt-4">
          <StageStrip status={o.status} first="Ordered" />
        </div>
      )}
      <div className="mt-6 flex items-baseline justify-between gap-3">
        <h3 className="text-[1rem] font-semibold text-ink">What the counter took</h3>
        <span className="tabular text-[0.9375rem] text-ink-2">{piecesLabel(pieces)}</span>
      </div>
      <div className="mt-1 border-t border-line">
        <DesignRuns runs={orderRuns(o)} />
      </div>
    </section>
  );
}

/** What the order costs, what's been paid, and what's left for pickup. */
export function TicketOrderMoney({ order: o }: { order: TicketOrder }) {
  const stopped = o.status === "cancelled" || o.status === "declined";
  const owed = o.balance > 0 && !stopped;
  return (
    <section aria-labelledby="ticket-money-title">
      <SectionTitle id="ticket-money-title">Payment</SectionTitle>
      <dl className="mt-1 text-[0.9375rem]">
        <div className="flex items-baseline justify-between gap-3 py-2.5">
          <dt className="font-semibold text-ink">Total</dt>
          <dd className="voice-board tabular text-[1.75rem] leading-none text-ink">{formatPeso(o.total)}</dd>
        </div>
        {o.payments.map((p) => (
          <div key={p.key} className="flex items-baseline justify-between gap-3 border-t border-line py-2.5">
            <dt className="min-w-0 text-ink-2">
              {p.label} <span className="tabular">· {day(p.at)}</span>
            </dt>
            <dd className="tabular text-ink">{formatPeso(p.amount)}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 border-t border-line py-2.5">
          <dt className="font-semibold text-ink">{owed ? "Balance at pickup" : "Paid"}</dt>
          <dd className="tabular font-semibold text-ink">{owed ? formatPeso(o.balance) : stopped ? formatPeso(o.paid) : "In full"}</dd>
        </div>
      </dl>
      {(owed || (stopped && o.paid > 0)) && (
        <p className="mt-1 max-w-[38ch] text-[0.875rem] leading-relaxed text-ink-2">
          {stopped
            ? "The order was stopped. Ask the shop about what you paid."
            : o.status === "ready"
              ? "Pay the balance at the counter when you pick it up."
              : "Paid at the counter when you pick it up. The shop lets you know when it’s ready."}
        </p>
      )}
    </section>
  );
}
