import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { formatPeso } from "@/features/shared/catalog/catalog";
import { REQUESTS_MIGRATION, type MyOrderSummary } from "@/features/customer/orders/data";
import { downPaymentOf, payAction } from "@/features/customer/orders/model";
import { pageShell } from "@/features/customer/shell/components/page-parts";
import { ticketState } from "@/features/shared/tickets/model";
import type { TicketSummary } from "@/features/customer/tickets/data";
import { TicketRow } from "@/features/customer/tickets/components/ticket-parts";
import { dayDate, shortDate, StageStrip, StatusPill } from "./order-parts";

const newRequestButton =
  "press inline-flex h-12 items-center justify-center gap-2 rounded-full bg-action px-6 text-[0.9375rem] font-semibold text-action-ink hover:bg-action-deep";

/**
 * The Orders tab: a counter ticket waiting to be shown leads, then custom orders in
 * progress, then everything closed (orders and tickets together), newest first.
 */
export function OrdersListView({
  orders,
  tickets,
  now,
  error,
  migrated,
}: {
  orders: MyOrderSummary[];
  tickets: TicketSummary[];
  /** The visit's clock, for which tickets have run out. */
  now: number;
  error: boolean;
  migrated: boolean;
}) {
  const ready = tickets.filter((t) => ticketState(t, now) === "ready");
  const inProgress = orders.filter((o) => !CLOSED.has(o.status));
  const past = [
    ...orders.filter((o) => CLOSED.has(o.status)).map((o) => ({ at: o.created_at, key: o.id, row: <OrderRow key={o.id} order={o} /> })),
    ...tickets
      .filter((t) => ticketState(t, now) !== "ready")
      .map((t) => ({ at: t.createdAt, key: t.id, row: <TicketRow key={t.id} ticket={t} now={now} /> })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className={pageShell}>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-5 sm:mb-10">
        <div>
          <h1 className="voice-display text-[clamp(2.25rem,5vw,3.5rem)]">Orders</h1>
          <p className="mt-3 max-w-[48ch] text-[1.0625rem] leading-relaxed text-ink-2">
            Counter tickets for the shop and custom kits you’ve asked it to make, and where each one is.
          </p>
        </div>
        {orders.length > 0 && (
          <Link href="/orders/new" className={newRequestButton}>
            <Plus aria-hidden="true" className="size-[1.125rem]" />
            Request a custom order
          </Link>
        )}
      </header>

      {!migrated && (
        <p role="status" className="auth-alert mb-6 max-w-[46rem] rounded-2xl px-5 py-4 text-[0.9375rem]">
          Custom orders need the shop’s latest database update ({REQUESTS_MIGRATION}). Requests can’t be sent until it runs.
        </p>
      )}

      {error ? (
        <p role="alert" className="auth-alert max-w-[46rem] rounded-2xl px-5 py-4 text-[0.9375rem]">
          We couldn’t load your orders just now. Check your connection, then refresh the page.
        </p>
      ) : (
        <div className="flex flex-col gap-12">
          {ready.length > 0 && (
            <section aria-label="Ready for the counter">
              <h2 className="voice-display mb-1 text-[1.5rem]">Ready for the counter</h2>
              <ul className="divide-y divide-line border-y border-line">
                {ready.map((t) => (
                  <TicketRow key={t.id} ticket={t} now={now} />
                ))}
              </ul>
            </section>
          )}

          {orders.length === 0 ? (
            <div className="max-w-[46rem]">
              <StageStrip status={null} />
              <section className="mt-6 rounded-[1.25rem] bg-ground-2 px-5 py-6 shadow-[inset_0_0_0_1px_var(--line)] sm:px-7 sm:py-7">
                <h2 className="text-[1.125rem] font-semibold leading-snug text-ink">No custom orders yet.</h2>
                <p className="mt-2 max-w-[56ch] text-[0.9375rem] leading-relaxed text-ink-2">
                  Send the shop what you need: garments, colors, and a size run for your team. It moves along this board as the shop
                  prices it, makes it, and gets it ready for pickup.
                </p>
                <Link href="/orders/new" className={`${newRequestButton} mt-6`}>
                  <Plus aria-hidden="true" className="size-[1.125rem]" />
                  Request a custom order
                </Link>
              </section>
            </div>
          ) : (
            inProgress.length > 0 && (
              <section aria-label="In progress">
                <h2 className="voice-display mb-1 text-[1.5rem]">In progress</h2>
                <ul className="divide-y divide-line border-y border-line">
                  {inProgress.map((o) => (
                    <OrderRow key={o.id} order={o} />
                  ))}
                </ul>
              </section>
            )
          )}

          {past.length > 0 && (
            <section aria-label="Past orders">
              <h2 className="voice-display mb-1 text-[1.5rem]">Past orders</h2>
              <ul className="divide-y divide-line border-y border-line">{past.map((p) => p.row)}</ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

const CLOSED = new Set(["completed", "declined", "cancelled"]);

/** What the customer still has to pay on an order, from the list's totals (same rule as the order page). */
function listAction(o: MyOrderSummary) {
  if (o.total_price === null) return null;
  const down = downPaymentOf(o.total_price);
  return payAction(o.status, {
    total: o.total_price,
    down,
    paid: o.paid,
    waiting: o.waiting,
    left: Math.max(0, o.total_price - o.paid - o.waiting),
    downLeft: Math.max(0, down - o.paid - o.waiting),
  });
}

function OrderRow({ order: o }: { order: MyOrderSummary }) {
  const action = listAction(o);
  return (
    <li>
      <Link href={`/orders/${o.id}`} className="group flex items-center gap-4 py-4 hover:bg-ground-2/60 sm:px-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="tabular text-[0.875rem] font-semibold text-ink-2">{o.order_number}</span>
            <StatusPill status={o.status} />
            {action && (
              <span className="tabular inline-flex h-7 items-center rounded-full bg-signal px-3 text-[0.8125rem] font-semibold text-signal-ink">
                {action.kind === "down" ? `Pay ${formatPeso(action.amount)} down payment` : `${formatPeso(action.amount)} balance due`}
              </span>
            )}
          </div>
          <p className="mt-1.5 truncate text-[1.0625rem] font-semibold text-ink">{o.team_name || o.description || "Custom order"}</p>
          <p className="mt-0.5 text-[0.875rem] text-ink-2">
            <span className="tabular">{o.pieces}</span> {o.pieces === 1 ? "piece" : "pieces"}
            {o.garments.length > 0 && ` · ${o.garments.slice(0, 3).join(", ")}${o.garments.length > 3 ? ` +${o.garments.length - 3}` : ""}`}
          </p>
          <p className="tabular mt-0.5 text-[0.8125rem] text-ink-2">
            Sent {shortDate(o.created_at)}
            {o.needed_by && ` · Needed by ${dayDate(o.needed_by)}`}
            {o.total_price !== null && ` · ${formatPeso(o.total_price)}`}
          </p>
        </div>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink-2 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}
