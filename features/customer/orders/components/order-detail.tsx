import Link from "next/link";
import { Check, CircleCheck, ChevronLeft, MapPin, RotateCcw } from "lucide-react";
import { formatPeso } from "@/features/shared/catalog/catalog";
import { garmentColor } from "@/features/shared/catalog/colors";
import type { MyOrder } from "@/features/customer/orders/data";
import {
  canPay,
  fromLines,
  garmentName,
  moneyOf,
  payAction,
  piecesOf,
  sizeRunText,
  STATUS_TEXT,
  STEPS,
  type Money,
  type MyPayment,
} from "@/features/customer/orders/model";
import { AskShop } from "@/features/customer/chat/components/ask-shop";
import { pageShell } from "@/features/customer/shell/components/page-parts";
import { CancelRequest } from "./cancel-request";
import { dayDate, shortDate, StageStrip, StatusPill } from "./order-parts";
import type { PaymentProvider } from "@/features/shared/payments/model";
import { PayModal } from "./pay-modal";

export type PickupInfo = { name: string; address: string | null; city: string; hours: string | null; phone: string | null };

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }).format(new Date(iso));

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-6">
      <dt className="text-[0.875rem] text-ink-2">{term}</dt>
      <dd className="min-w-0 break-words text-[0.9375rem] text-ink">{children}</dd>
    </div>
  );
}

function SectionTitle({ id, children, aside }: { id: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line pb-3">
      <h2 id={id} className="voice-display text-[1.75rem]">
        {children}
      </h2>
      {aside}
    </div>
  );
}

/** Reprints and returns to production, from the shop's notes in the history. */
function productionEvents(o: MyOrder) {
  return o.history
    .filter((h) => h.status === "in_progress" && h.note && /^(Failed inspection, reprinting|Back to production):/i.test(h.note))
    .map((h) => {
      const [, kind, reason] = h.note!.match(/^(Failed inspection, reprinting|Back to production):\s*(.*)$/i) ?? [];
      return { id: h.id, at: h.created_at, title: /^Failed/i.test(kind ?? "") ? "Reprinted after inspection" : "Back to production", reason: reason || null };
    });
}

const REWORK = /^(Failed inspection, reprinting|Back to production):\s*(.*)$/i;

/** A history entry's headline: the step the shop finished, a reprint, or the new status. */
function historyTitle(h: MyOrder["history"][number]) {
  if (h.status === "pending") return "Request sent";
  const rework = h.note?.match(REWORK);
  if (rework) return /^Failed/i.test(rework[1]) ? "Reprinted after inspection" : "Back to production";
  if (h.status === "in_progress" && h.note) return h.note; // "Printing done"
  return STATUS_TEXT[h.status];
}

/** The line under it: the shop's reason, when there is one beyond the headline. */
function historyNote(h: MyOrder["history"][number]) {
  const rework = h.note?.match(REWORK);
  if (rework) return rework[2] || null;
  if (h.status === "in_progress") return null;
  return h.note;
}

function PaymentPill({ status }: { status: MyPayment["status"] }) {
  // Verified is the admin's outlined ink; a payment still being checked is dashed (not settled yet).
  const checking: [string, string] = ["Being checked", "text-ink outline-dashed outline-[1.5px] -outline-offset-[1.5px] outline-ink-2"];
  const map: Record<MyPayment["status"], [string, string]> = {
    submitted: checking,
    pending: checking,
    verified: ["Verified", "text-ink shadow-[inset_0_0_0_1.5px_var(--ink)]"],
    rejected: ["Not accepted", "bg-ground-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]"],
  };
  const [text, tone] = map[status];
  return <span className={`inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-[0.75rem] font-semibold ${tone}`}>{text}</span>;
}

/** What the customer has to do next about money: the one amber thing in the app. */
function ActionNotice({ o, money, uid, providers }: { o: MyOrder; money: Money; uid: string; providers: PaymentProvider[] }) {
  const action = payAction(o.status, money);
  if (!action) return null;
  const text =
    action.kind === "down"
      ? `Pay the ${formatPeso(action.amount)} down payment so the shop can start making your order.`
      : o.status === "ready"
        ? providers.length
          ? `Your order is ready. Pay the ${formatPeso(action.amount)} balance online now, or in cash when you pick it up.`
          : `Your order is ready. Pay the ${formatPeso(action.amount)} balance when you pick it up.`
        : `There’s a ${formatPeso(action.amount)} balance left on this order.`;
  return (
    <div role="status" className="pay-notice mt-6 flex flex-col gap-4 rounded-2xl px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-3 text-[0.9375rem] leading-relaxed text-ink">
        {/* The live lamp: amber means "now", and what's live here is money the customer owes. */}
        <span aria-hidden="true" className="lamp mt-1.5 shrink-0" data-state="live" />
        <span>
        <span className="font-semibold">{action.kind === "down" ? "Down payment needed. " : "Balance due. "}</span>
        {text}
        </span>
      </p>
      {providers.length > 0 && (
        <PayModal orderId={o.id} orderNumber={o.order_number} uid={uid} money={money} providers={providers} trigger={`Pay ${formatPeso(action.amount)}`} />
      )}
    </div>
  );
}

/** One order as the customer sees it: where it is, what's owed, how it's being made, and what they asked for. */
export function OrderDetailView({
  order: o,
  flash,
  uid,
  providers,
  pickup,
}: {
  order: MyOrder;
  flash: "sent" | "saved" | null;
  uid: string;
  /** The providers the shop takes online. */
  providers: PaymentProvider[];
  pickup: PickupInfo;
}) {
  const garments = fromLines(o.lines);
  const pieces = garments.reduce((sum, g) => sum + piecesOf(g), 0);
  const pending = o.status === "pending";
  const closed = o.status === "declined" || o.status === "cancelled";
  const money = moneyOf(o.total_price, o.payments);
  const started = ["in_progress", "ready", "completed"].includes(o.status);
  const events = productionEvents(o);
  const action = money ? payAction(o.status, money) : null;
  const waiting = money && money.waiting > 0;

  return (
    <div className={pageShell}>
      <div className="mx-auto max-w-[72rem]">
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
            <p className="mt-1.5 text-[0.9375rem] text-ink-2">
              {o.team_name ? `${o.team_name} · ` : ""}Sent {shortDate(o.created_at)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <AskShop
              label="Ask about this order"
              detail={{ order: { id: o.id, number: o.order_number } }}
              className="h-10 rounded-full px-4 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2"
            />
            <StatusPill status={o.status} />
          </div>
        </header>

        <div className="mt-6">
          {closed ? (
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

        {money && <ActionNotice o={o} money={money} uid={uid} providers={providers} />}
        {waiting && !action && (
          <p className="mt-5 text-[0.9375rem] text-ink-2">
            Your <span className="tabular font-semibold text-ink">{formatPeso(money!.waiting)}</span> payment is being checked by the shop.
          </p>
        )}

        {pending && (
          <>
            <p className="mt-5 text-[0.9375rem] leading-relaxed text-ink-2">The shop hasn’t priced this yet. Until it does, you can still edit or cancel it.</p>
            {o.migrated && (
              <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
                <Link
                  href={`/orders/${o.id}/edit`}
                  className="press inline-flex h-12 items-center justify-center rounded-full px-6 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--ink)] hover:bg-ground-2"
                >
                  Edit request
                </Link>
                <CancelRequest orderId={o.id} orderNumber={o.order_number} />
              </div>
            )}
          </>
        )}

        <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
          <div className="flex min-w-0 flex-col gap-12">
            {/* How it's being made */}
            {!pending && !closed && (
              <section aria-labelledby="making-title">
                <SectionTitle id="making-title">Production</SectionTitle>
                {!started && <p className="mt-3 text-[0.9375rem] text-ink-2">Production starts once the down payment is in. Each step shows here as the shop finishes it.</p>}
                <ol className="mt-1">
                  {STEPS.map((s, i) => {
                    const done = o.steps[s.id];
                    const next = started && !done && STEPS.slice(0, i).every((x) => o.steps[x.id]);
                    return (
                      <li key={s.id} className="flex items-center gap-3.5 border-b border-line py-3.5">
                        <span
                          aria-hidden="true"
                          className={`grid size-6 shrink-0 place-items-center rounded-full ${
                            done ? "bg-ink text-ground" : next ? "shadow-[inset_0_0_0_2px_var(--ink)]" : "shadow-[inset_0_0_0_1.5px_var(--line)]"
                          }`}
                        >
                          {done && <Check className="size-3.5" strokeWidth={3} />}
                        </span>
                        <span className={`flex-1 text-[0.9375rem] ${done ? "font-semibold text-ink" : next ? "font-semibold text-ink" : "text-ink-2"}`}>{s.label}</span>
                        <span className="tabular text-[0.875rem] text-ink-2">
                          {done ? when(done) : next ? "In progress" : ""}
                          <span className="sr-only">{done ? ", done" : next ? "" : ", not yet"}</span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
                {events.length > 0 && (
                  <ul className="mt-4 flex flex-col gap-2.5">
                    {events.map((e) => (
                      <li key={e.id} className="flex items-start gap-3 rounded-2xl bg-ground-2 px-4 py-3 text-[0.9375rem] shadow-[inset_0_0_0_1px_var(--line)]">
                        <RotateCcw aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-2" />
                        <span>
                          <span className="font-semibold text-ink">{e.title}</span>
                          <span className="tabular text-ink-2"> · {when(e.at)}</span>
                          {e.reason && <span className="block text-ink-2">{e.reason}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {/* Finished photos */}
            {o.photos.length > 0 && (
              <section aria-labelledby="photos-title">
                <SectionTitle id="photos-title">Finished photos</SectionTitle>
                <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {o.photos.map((p, i) => (
                    <li key={p.id}>
                      {p.url ? (
                        <a href={p.url} target="_blank" rel="noreferrer" className="shop-tile block aspect-square">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.url} alt={`Finished order, photo ${i + 1}`} className="size-full object-cover" />
                          <span className="sr-only"> (opens full size)</span>
                        </a>
                      ) : (
                        <span className="shop-tile grid aspect-square place-items-center text-[0.8125rem] text-card-ink/70">Unavailable</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* What they asked for */}
            <section aria-labelledby="request-title">
              <SectionTitle id="request-title">Your request</SectionTitle>
              <dl className="divide-y divide-line">
                <Row term="For">{o.description || <span className="text-ink-2">Not given</span>}</Row>
                {o.migrated && (
                  <>
                    <Row term="Team">{o.team_name || <span className="text-ink-2">Not given</span>}</Row>
                    <Row term="Needed by">{o.needed_by ? dayDate(o.needed_by) : <span className="text-ink-2">No deadline</span>}</Row>
                  </>
                )}
                {o.design && (
                  <Row term="Design">
                    {o.design.url ? (
                      <a href={o.design.url} target="_blank" rel="noreferrer" className="shop-tile block aspect-[3/2] w-56 max-w-full rounded-xl">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={o.design.url} alt="Your design from the studio" className="size-full object-contain" />
                        <span className="sr-only"> (opens full size)</span>
                      </a>
                    ) : (
                      <span className="text-ink-2">Design from the studio</span>
                    )}
                  </Row>
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

            <section aria-labelledby="garments-title">
              <SectionTitle id="garments-title" aside={<span className="tabular text-[0.9375rem] font-semibold text-ink-2">{pieces} {pieces === 1 ? "piece" : "pieces"}</span>}>
                Garments
              </SectionTitle>
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

          <aside className="flex min-w-0 flex-col gap-12">
            {/* Money */}
            {money && o.status !== "declined" && (
              <section id="payments" aria-labelledby="money-title" className="scroll-mt-24">
                <SectionTitle id="money-title">Price and payments</SectionTitle>
                <dl className="mt-1 text-[0.9375rem]">
                  <div className="flex items-baseline justify-between gap-3 py-2.5">
                    <dt className="text-ink-2">Total</dt>
                    <dd className="voice-board tabular text-[1.75rem] leading-none text-ink">{formatPeso(money.total)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-t border-line py-2.5">
                    <dt className="text-ink-2">Down payment (50%)</dt>
                    <dd className="tabular text-ink">
                      {formatPeso(money.down)}
                      {money.paid >= money.down && <span className="text-ink-2"> · paid</span>}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-t border-line py-2.5">
                    <dt className="text-ink-2">Paid</dt>
                    <dd className="tabular text-ink">{formatPeso(money.paid)}</dd>
                  </div>
                  {money.waiting > 0 && (
                    <div className="flex items-baseline justify-between gap-3 border-t border-line py-2.5">
                      <dt className="text-ink-2">Being checked</dt>
                      <dd className="tabular text-ink">{formatPeso(money.waiting)}</dd>
                    </div>
                  )}
                  <div className="flex items-baseline justify-between gap-3 border-t border-line py-2.5">
                    {money.total - money.paid > 0 ? (
                      <>
                        <dt className="font-semibold text-ink">Still to pay</dt>
                        <dd className="tabular font-semibold text-ink">{formatPeso(money.total - money.paid)}</dd>
                      </>
                    ) : (
                      <>
                        <dt className="font-semibold text-ink">Fully paid</dt>
                        <dd>
                          <Check aria-hidden="true" className="size-4 text-ink" strokeWidth={3} />
                        </dd>
                      </>
                    )}
                  </div>
                  {o.refunded > 0 && (
                    <div className="flex items-baseline justify-between gap-3 border-t border-line py-2.5">
                      <dt className="text-ink-2">Refunded</dt>
                      <dd className="tabular text-ink">{formatPeso(o.refunded)}</dd>
                    </div>
                  )}
                </dl>

                {o.payments.length > 0 && (
                  <ul className="mt-3 border-t border-line">
                    {o.payments.map((p) => (
                      <li key={p.id} className="border-b border-line py-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0">
                            <span className="tabular block text-[0.9375rem] font-semibold text-ink">{formatPeso(p.amount)}</span>
                            <span className="tabular block text-[0.8125rem] text-ink-2">
                              {p.method === "cash" ? "Cash at the shop" : `${p.providerName ?? "E-payment"}${p.last4 ? ` · ref …${p.last4}` : ""}`} · {shortDate(p.created_at)}
                            </span>
                          </span>
                          <PaymentPill status={p.status} />
                        </div>
                        {p.status === "rejected" && p.rejection_reason && (
                          <p className="mt-1.5 text-[0.875rem] leading-relaxed text-ink-2">“{p.rejection_reason}”</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {!action && canPay(o.status, money) && providers.length > 0 && (
                  <div className="mt-5">
                    <PayModal orderId={o.id} orderNumber={o.order_number} uid={uid} money={money} providers={providers} trigger="Pay online" tone="outline" />
                  </div>
                )}
                {canPay(o.status, money) && (
                  <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-2">You can also pay cash at the counter; staff record it there.</p>
                )}
              </section>
            )}

            {/* Pickup */}
            {(o.status === "ready" || o.status === "completed") && (
              <section aria-labelledby="pickup-title">
                <SectionTitle id="pickup-title">{o.status === "ready" ? "Pickup" : "Picked up"}</SectionTitle>
                {o.status === "ready" ? (
                  <div className="mt-3 text-[0.9375rem] leading-relaxed">
                    <p className="text-ink">
                      Bring your order number, <span className="tabular font-semibold">{o.order_number}</span>, to the shop.
                    </p>
                    <p className="mt-3 flex items-start gap-2 text-ink">
                      <MapPin aria-hidden="true" className="mt-1 size-4 shrink-0 text-ink-2" />
                      <span>
                        {pickup.name}
                        <br />
                        {pickup.address ?? <span className="text-ink-2">Street address to follow</span>}, {pickup.city}
                      </span>
                    </p>
                    <p className={`mt-2 ${pickup.hours ? "text-ink" : "text-ink-2"}`}>{pickup.hours ?? "Store hours to follow"}</p>
                  </div>
                ) : (
                  <p className="mt-3 text-[0.9375rem] text-ink-2">{o.completed_at ? `Picked up ${shortDate(o.completed_at)}. Thank you!` : "Thank you!"}</p>
                )}
              </section>
            )}

            {/* History */}
            <section aria-labelledby="history-title">
              <SectionTitle id="history-title">History</SectionTitle>
              <ol className="mt-1">
                {[...o.history].reverse().map((h) => (
                  <li key={h.id} className="border-b border-line py-3">
                    <p className="flex items-baseline justify-between gap-3 text-[0.9375rem]">
                      <span className="font-semibold text-ink">{historyTitle(h)}</span>
                      <span className="tabular shrink-0 text-[0.8125rem] text-ink-2">{when(h.created_at)}</span>
                    </p>
                    {historyNote(h) && (
                      <p className="mt-0.5 text-[0.875rem] leading-relaxed text-ink-2">
                        {h.byCustomer ? "You: " : ""}
                        {historyNote(h)}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
