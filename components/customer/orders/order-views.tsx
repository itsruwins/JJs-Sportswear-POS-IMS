import Link from "next/link";
import { CircleCheck, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { formatPeso } from "@/lib/admin/catalog";
import { garmentColor } from "@/lib/customer/colors";
import { REQUESTS_MIGRATION, type MyOrder, type MyOrderSummary } from "@/lib/customer/order-data";
import { fromLines, garmentName, piecesOf, sizeRunText } from "@/lib/customer/orders";
import { pageShell } from "../page-parts";
import { CancelRequest } from "./cancel-request";
import { dayDate, shortDate, StageStrip, StatusPill } from "./order-parts";

const newRequestButton =
  "press inline-flex h-12 items-center justify-center gap-2 rounded-full bg-board px-6 text-[0.9375rem] font-semibold text-board-ink hover:bg-board-deep";

/** The Orders tab: every request the customer has sent, newest first. */
export function OrdersListView({ orders, error, migrated }: { orders: MyOrderSummary[]; error: boolean; migrated: boolean }) {
  return (
    <div className={pageShell}>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-5 sm:mb-10">
        <div>
          <h1 className="voice-display text-[clamp(2.25rem,5vw,3.5rem)]">Orders</h1>
          <p className="mt-3 max-w-[48ch] text-[1.0625rem] leading-relaxed text-ink-2">
            Custom kits you’ve asked the shop to make, and where each one is.
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
      ) : orders.length === 0 ? (
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
        <ul className="divide-y divide-line border-y border-line">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="group flex items-center gap-4 py-4 hover:bg-ground-2/60 sm:px-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="tabular text-[0.875rem] font-semibold text-ink-2">{o.order_number}</span>
                    <StatusPill status={o.status} />
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
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-6">
      <dt className="text-[0.875rem] text-ink-2">{term}</dt>
      <dd className="min-w-0 break-words text-[0.9375rem] text-ink">{children}</dd>
    </div>
  );
}

/** One order as the customer sees it in C3: where it is, what they asked for, and edit/cancel while pending. */
export function OrderDetailView({ order: o, flash }: { order: MyOrder; flash: "sent" | "saved" | null }) {
  const garments = fromLines(o.lines);
  const pieces = garments.reduce((sum, g) => sum + piecesOf(g), 0);
  const pending = o.status === "pending";

  return (
    <div className={pageShell}>
      <div className="mx-auto max-w-[46rem]">
        <Link href="/orders" className="press -ml-2 mb-5 inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-[0.9375rem] font-medium text-ink-2 hover:text-ink">
          <ChevronLeft aria-hidden="true" className="size-4" />
          Orders
        </Link>

        {flash && (
          <p role="status" className="mb-6 flex items-start gap-3 rounded-2xl bg-ground-2 px-5 py-4 text-[0.9375rem] text-ink shadow-[inset_0_0_0_1px_var(--line)]">
            <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-board-text" />
            <span>
              <span className="font-semibold">{flash === "sent" ? "Request sent." : "Changes saved."}</span>{" "}
              {flash === "sent" ? "The shop will review it and send you a price." : "The shop sees your updated request."}
            </span>
          </p>
        )}

        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="voice-display tabular text-[clamp(2rem,4.5vw,3rem)]">{o.order_number}</h1>
            <p className="mt-1.5 text-[0.9375rem] text-ink-2">Sent {shortDate(o.created_at)}</p>
          </div>
          <StatusPill status={o.status} />
        </header>

        <div className="mt-6">
          {o.status === "declined" || o.status === "cancelled" ? (
            <div className="rounded-2xl bg-ground-2 px-5 py-4 shadow-[inset_0_0_0_1px_var(--line)]">
              <p className="text-[1rem] font-semibold text-ink">{o.status === "declined" ? "The shop declined this request" : "This request was cancelled"}</p>
              {o.status === "declined" && o.decline_reason && <p className="mt-1 text-[0.9375rem] text-ink-2">“{o.decline_reason}”</p>}
              <p className="mt-2 text-[0.9375rem] text-ink-2">
                You can send a new request any time.{" "}
                <Link href="/orders/new" className="font-semibold text-ink underline underline-offset-4 hover:no-underline">
                  Request a custom order
                </Link>
              </p>
            </div>
          ) : (
            <StageStrip status={o.status} />
          )}
        </div>

        {pending ? (
          <p className="mt-5 text-[0.9375rem] leading-relaxed text-ink-2">
            The shop hasn’t priced this yet. Until it does, you can still edit or cancel it.
          </p>
        ) : (
          o.total_price !== null &&
          o.status !== "declined" &&
          o.status !== "cancelled" && (
            <p className="mt-5 text-[0.9375rem] text-ink-2">
              Price <span className="tabular font-semibold text-ink">{formatPeso(o.total_price)}</span>. Payments and production updates
              show here in a later update.
            </p>
          )
        )}

        {pending && o.migrated && (
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
            <Link
              href={`/orders/${o.id}/edit`}
              className="press inline-flex h-12 items-center justify-center rounded-full px-6 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--ink)] hover:bg-ground-2"
            >
              Edit request
            </Link>
            <CancelRequest orderId={o.id} orderNumber={o.order_number} />
          </div>
        )}

        <section aria-labelledby="request-title" className="mt-12">
          <h2 id="request-title" className="voice-display border-b border-line pb-3 text-[1.75rem]">
            Your request
          </h2>
          <dl className="divide-y divide-line">
            <Row term="For">{o.description || <span className="text-ink-2">Not given</span>}</Row>
            {o.migrated && (
              <>
                <Row term="Team">{o.team_name || <span className="text-ink-2">Not given</span>}</Row>
                <Row term="Needed by">{o.needed_by ? dayDate(o.needed_by) : <span className="text-ink-2">No deadline</span>}</Row>
              </>
            )}
            {o.references.length > 0 && (
              <Row term="Pictures">
                <span className="flex flex-wrap gap-2.5">
                  {o.references.map((r, i) =>
                    r.url ? (
                      <a key={r.path} href={r.url} target="_blank" rel="noreferrer" className="shop-tile block size-24 rounded-xl">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.url} alt={`Reference picture ${i + 1}`} className="size-full object-contain p-1.5" />
                      </a>
                    ) : (
                      <span key={r.path} className="shop-tile grid size-24 place-items-center rounded-xl text-[0.8125rem] text-card-ink/70">
                        Unavailable
                      </span>
                    ),
                  )}
                </span>
              </Row>
            )}
            {o.notes && <Row term="Notes">{<span className="whitespace-pre-line">{o.notes}</span>}</Row>}
          </dl>
        </section>

        <section aria-labelledby="garments-title" className="mt-10">
          <div className="flex items-baseline justify-between gap-3 border-b border-line pb-3">
            <h2 id="garments-title" className="voice-display text-[1.75rem]">
              Garments
            </h2>
            <span className="tabular text-[0.9375rem] font-semibold text-ink-2">
              {pieces} {pieces === 1 ? "piece" : "pieces"}
            </span>
          </div>
          <ul className="divide-y divide-line">
            {garments.map((g) => (
              <li key={g.key} className="flex items-start gap-3 py-4">
                <span
                  aria-hidden="true"
                  className="mt-1 size-4 shrink-0 rounded-full shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_18%,transparent)]"
                  style={{ background: g.color ? garmentColor(g.color).body : "transparent" }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[1rem] font-semibold text-ink">
                    {garmentName(g)}
                    {g.color && <span className="font-normal text-ink-2"> · {g.color}</span>}
                  </p>
                  <p className="tabular mt-0.5 text-[0.9375rem] text-ink-2">{sizeRunText(g)}</p>
                  {g.notes && <p className="mt-1.5 whitespace-pre-line text-[0.875rem] leading-relaxed text-ink-2">{g.notes}</p>}
                </div>
                <span className="tabular shrink-0 text-[1rem] font-semibold text-ink">{piecesOf(g)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
