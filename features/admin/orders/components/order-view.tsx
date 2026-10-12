import Link from "next/link";
import { ArrowLeft, Mail, MessageCircle, Phone } from "lucide-react";
import { clock, dayLabel, firstNameOf } from "@/features/shared/chat/format";
import { unreadFor, type ChatMessage } from "@/features/admin/chat/data";
import { formatPeso } from "@/features/shared/catalog/catalog";
import { downPayment, PRODUCTION_MIGRATION, STATUS_LABEL, STEPS, VIEWS, type OrderDetail, type OrderStatus, type OrderView } from "@/features/admin/orders/data";
import { CancelOrderButton, HandoverPanel, OrderFlash, PhotoManager, ProductionChecklist, ReviewPanel } from "./order-actions";
import { PaymentException, RecordPayment, RecordRefund } from "@/features/admin/payments/components/payment-actions";
import { PayPill } from "@/features/admin/payments/components/payment-parts";
import type { PaymentProvider } from "@/features/shared/payments/model";
import { methodLine, PAY_TYPE_LABEL, PAYMENTS_MIGRATION, type OrderMoney } from "@/features/admin/payments/data";
import { ago, personName, StatusPill, when } from "./order-parts";

const TRACK: { status: OrderStatus; label: string }[] = [
  { status: "pending", label: "Placed" },
  { status: "accepted", label: "Accepted" },
  { status: "in_progress", label: "In production" },
  { status: "ready", label: "Ready" },
  { status: "completed", label: "Picked up" },
];
const RANK: Record<OrderStatus, number> = { pending: 0, accepted: 1, in_progress: 2, ready: 3, completed: 4, declined: 0, cancelled: -1 };

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="mt-10 first:mt-0">
      <div className="flex items-end justify-between gap-4 border-b border-line pb-3">
        <h2 className="voice-display text-[1.5rem]">{title}</h2>
        {aside}
      </div>
      <div className="pt-4">{children}</div>
    </section>
  );
}

/** One custom order: where it stands, what to do next, what was ordered, and everything that happened. */
export function OrderView({
  order: o,
  money,
  isOwner = false,
  now = new Date(),
  backView = "open",
  chat,
  providers = [],
}: {
  order: OrderDetail;
  /** Payments, refunds, and exceptions (absent before the payments phase data is loaded). */
  money?: OrderMoney;
  isOwner?: boolean;
  now?: Date;
  backView?: OrderView;
  /** The owner's view: the latest messages about this order. */
  chat?: { messages: ChatMessage[]; total: number; error?: boolean; ownerId: string };
  /** Active providers, for recording e-payments. */
  providers?: PaymentProvider[];
}) {
  const closed = o.status === "declined" || o.status === "cancelled";
  const pieces = o.items.reduce((s, i) => s + i.quantity, 0);
  // History is newest first; the first cancelled row is the reason (later ones are refunds).
  const cancelNote = o.status === "cancelled" ? [...o.history].reverse().find((h) => h.status === "cancelled")?.note : null;
  const steps = Object.fromEntries(
    Object.entries(o.steps).map(([k, v]) => [k, { ...v!, when: when(v!.done_at) }]),
  ) as Parameters<typeof ProductionChecklist>[0]["steps"];
  const stepsDone = STEPS.filter((s) => o.steps[s.id]).length;
  const showProduction = o.migrated && ["accepted", "in_progress", "ready", "completed"].includes(o.status);
  const showPhotos = o.migrated && ["in_progress", "ready", "completed"].includes(o.status);
  // The payment rules: production waits for the down payment, pickup for the full amount (unless the owner made an exception).
  const waitingDown = !!money && o.status === "accepted" && !money.downMet && !money.overrides.production;
  const balanceDue = money && !money.overrides.pickup ? money.due : 0;

  return (
    <div className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10">
      <Link href={backView === "open" ? "/admin/orders" : `/admin/orders?view=${backView}`} className="press inline-flex items-center gap-1.5 py-1 text-[0.9375rem] font-semibold text-ink hover:underline">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Custom orders
        {backView !== "open" && <span className="font-normal text-ink-2">· {VIEWS.find((v) => v.id === backView)?.label}</span>}
      </Link>

      <header className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="voice-display tabular text-[clamp(2rem,4.5vw,3rem)]">{o.order_number}</h1>
          <p className="mt-1.5 text-[0.9375rem] text-ink-2">
            {personName(o.customer)} · placed {when(o.created_at)}
            {/* The relative time only when it says more than the date (within the week). */}
            {now.getTime() - new Date(o.created_at).getTime() < 7 * 86_400_000 && ` (${ago(o.created_at, now).toLowerCase()})`}
          </p>
        </div>
        <StatusPill status={o.status} progress={stepsDone} />
      </header>

      {/* Outcomes of status moves land here: the panel that started them is often gone after. */}
      <OrderFlash orderId={o.id} />

      {/* Where the order stands */}
      {closed ? (
        <div className="mt-6 rounded-2xl bg-ground-2 px-5 py-4 shadow-[inset_0_0_0_1px_var(--line)]">
          <p className="text-[1rem] font-semibold text-ink">{o.status === "declined" ? "Declined" : "Cancelled"}</p>
          <p className="mt-1 text-[0.9375rem] text-ink-2">
            {o.status === "declined" ? `Told the customer: “${o.decline_reason}”` : cancelNote ? `Reason: “${cancelNote}”` : "No reason was given."}
          </p>
        </div>
      ) : (
        // The order's game clock: a small board with a lamp per stage, the way the landing page's
        // scoreboard keeps periods. Passed stages are lit, the current one is live (amber).
        <div className="board mt-6 rounded-[1.25rem] px-4 py-3.5 text-board-ink sm:px-5">
          <ol aria-label="Order progress" className="grid grid-cols-5 gap-2">
            {TRACK.map((t, i) => {
              const rank = RANK[o.status];
              const done = rank > i || o.status === "completed";
              const live = rank === i && o.status !== "completed";
              return (
                <li key={t.status} aria-current={live ? "step" : undefined} className="flex min-w-0 items-center gap-2">
                  <span aria-hidden="true" className="lamp shrink-0" data-state={live ? "live" : done ? "done" : undefined} />
                  {/* Phones name only the current stage (below); wider screens label each one. */}
                  <span className={`hidden truncate text-[0.8125rem] sm:block ${live ? "font-semibold text-board-ink" : done ? "text-board-ink" : "text-board-ink-2"}`}>
                    {t.label}
                  </span>
                  <span className="sr-only sm:hidden">
                    {t.label}
                    {done ? ", done" : live ? ", now" : ""}
                  </span>
                </li>
              );
            })}
          </ol>
          <p aria-hidden="true" className="mt-2.5 flex items-baseline justify-between gap-3 text-[0.875rem] sm:hidden">
            <span className="font-semibold">{TRACK[Math.max(0, RANK[o.status])].label}</span>
            <span className="voice-board tabular text-[1.125rem] leading-none">{Math.max(0, RANK[o.status]) + 1}/5</span>
          </p>
        </div>
      )}

      {!o.migrated && (
        <p role="status" className="auth-alert mt-6 rounded-2xl px-5 py-4 text-[0.9375rem]">
          Production steps and photos need the latest database update ({PRODUCTION_MIGRATION}).
        </p>
      )}

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
        <div className="min-w-0">
          {o.status === "pending" && (
            <Section title="Review and price">
              {isOwner ? (
                <>
                  <p className="mb-4 max-w-[60ch] text-[0.9375rem] text-ink-2">
                    Check what they asked for below, agree the details with the customer, then set the price to accept it.
                  </p>
                  <ReviewPanel id={o.id} status={o.status} price={o.total_price} />
                </>
              ) : (
                <p className="max-w-[60ch] text-[0.9375rem] text-ink-2">New order. The owner reviews it, agrees the details with the customer, and sets the price.</p>
              )}
            </Section>
          )}

          {o.status === "ready" && (
            <Section title="Hand over">
              <p className="mb-4 text-[0.9375rem] text-ink-2">Ready since {o.ready_at ? when(o.ready_at) : "today"}. The customer has been told it’s ready.</p>
              {balanceDue > 0 && (
                <div className="mb-4 rounded-xl bg-ground-2 px-4 py-3 shadow-[inset_0_0_0_1px_var(--line)]">
                  {money && money.waiting > 0 && money.waitingId ? (
                    <p className="text-[0.9375rem] text-ink">
                      <span className="font-semibold">Balance due: </span>
                      <span className="tabular font-semibold">{formatPeso(balanceDue)}</span>.{" "}
                      <Link href={`/admin/payments/${money.waitingId}`} className="font-semibold underline underline-offset-2">
                        <span className="tabular">{formatPeso(money.waiting)}</span> sent by GCash is waiting for review
                      </Link>
                      {balanceDue > money.waiting ? (
                        <>
                          ; record the other <span className="tabular font-semibold">{formatPeso(Math.round((balanceDue - money.waiting) * 100) / 100)}</span> under Price and payments.
                        </>
                      ) : (
                        <>; check it before pickup.</>
                      )}
                    </p>
                  ) : (
                    <p className="text-[0.9375rem] text-ink">
                      <span className="font-semibold">Balance due: </span>
                      <span className="tabular font-semibold">{formatPeso(balanceDue)}</span>. Record it under Price and payments before pickup.
                    </p>
                  )}
                  {isOwner && <div className="mt-1.5"><PaymentException orderId={o.id} kind="pickup" /></div>}
                </div>
              )}
              {money?.overrides.pickup && (
                <p className="mb-4 text-[0.875rem] text-ink-2">
                  Owner allowed pickup before full payment: “{money.overrides.pickup.reason}”
                </p>
              )}
              {isOwner ? (
                <HandoverPanel id={o.id} balanceDue={balanceDue} />
              ) : (
                <p className="text-[0.9375rem] text-ink-2">The owner completes the order when the customer picks it up.</p>
              )}
            </Section>
          )}

          {o.status === "completed" && (
            <Section title="Completed">
              <p className="text-[0.9375rem] text-ink-2">Picked up {o.completed_at ? when(o.completed_at) : ""}.</p>
            </Section>
          )}

          {showProduction && (
            <Section title="Production" aside={<span className="tabular text-[0.875rem] text-ink-2">{stepsDone} of 5 done</span>}>
              {waitingDown && money && (
                <div className="mb-4 rounded-xl bg-ground-2 px-4 py-3 shadow-[inset_0_0_0_1px_var(--line)]">
                  <p className="text-[0.9375rem] text-ink">
                    <span className="font-semibold">Waiting for the down payment. </span>
                    Production starts once <span className="tabular font-semibold">{formatPeso(money.downDue)}</span> is paid; so far{" "}
                    <span className="tabular font-semibold">{formatPeso(money.paid)}</span>
                    {money.waiting > 0 && money.waitingId && (
                      <>
                        {" "}(plus{" "}
                        <Link href={`/admin/payments/${money.waitingId}`} className="font-semibold underline underline-offset-2">
                          <span className="tabular">{formatPeso(money.waiting)}</span> to review
                        </Link>
                        )
                      </>
                    )}
                    .
                  </p>
                  {isOwner && <div className="mt-1.5"><PaymentException orderId={o.id} kind="production" /></div>}
                </div>
              )}
              {money?.overrides.production && o.status === "accepted" && (
                <p className="mb-4 text-[0.875rem] text-ink-2">Owner let production start before the down payment: “{money.overrides.production.reason}”</p>
              )}
              <ProductionChecklist id={o.id} status={o.status} steps={steps} locked={waitingDown} readOnly={!isOwner} />
            </Section>
          )}

          <Section title="What they ordered" aside={<span className="tabular text-[0.875rem] text-ink-2">{pieces} {pieces === 1 ? "piece" : "pieces"}</span>}>
            {(o.team_name || o.needed_by) && (
              <dl className="mb-4 grid gap-4 sm:grid-cols-2">
                {o.team_name && (
                  <div>
                    <dt className="voice-label text-[0.75rem] text-ink-2">Team</dt>
                    <dd className="mt-1 text-[0.9375rem] font-semibold text-ink">{o.team_name}</dd>
                  </div>
                )}
                {o.needed_by && (
                  <div>
                    <dt className="voice-label text-[0.75rem] text-ink-2">Needed by</dt>
                    <dd className="tabular mt-1 text-[0.9375rem] font-semibold text-ink">
                      {new Intl.DateTimeFormat("en-PH", { weekday: "short", month: "long", day: "numeric", year: "numeric" }).format(
                        new Date(`${o.needed_by}T00:00:00+08:00`),
                      )}
                    </dd>
                  </div>
                )}
              </dl>
            )}
            {o.items.length === 0 ? (
              <p className="text-[0.9375rem] text-ink-2">No items listed. Ask the customer for sizes and quantities.</p>
            ) : (
              <ul className="border-t border-line">
                {o.items.map((i) => (
                  <li key={i.id} className="flex items-start justify-between gap-4 border-b border-line py-3">
                    <div className="min-w-0">
                      <p className="text-[0.9375rem] font-semibold text-ink">{i.garment}</p>
                      <p className="text-[0.875rem] text-ink-2">{[i.color, i.size].filter(Boolean).join(" · ") || "No color or size given"}</p>
                      {i.notes && <p className="mt-0.5 whitespace-pre-line text-[0.875rem] text-ink">{i.notes}</p>}
                    </div>
                    <span className="voice-board tabular shrink-0 text-[1.375rem] leading-none text-ink">×{i.quantity}</span>
                  </li>
                ))}
              </ul>
            )}
            {(o.description || o.notes) && (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {o.description && (
                  <div>
                    <p className="voice-label text-[0.75rem] text-ink-2">Request</p>
                    <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink">{o.description}</p>
                  </div>
                )}
                {o.notes && (
                  <div>
                    <p className="voice-label text-[0.75rem] text-ink-2">Notes</p>
                    <p className="mt-1 whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink">{o.notes}</p>
                  </div>
                )}
              </div>
            )}
            {o.references.length > 0 && (
              <div className="mt-5">
                <p className="voice-label text-[0.75rem] text-ink-2">Reference pictures</p>
                <ul className="mt-2 flex flex-wrap gap-3">
                  {o.references.map((r, i) => (
                    <li key={r.path}>
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noreferrer" className="press block size-28 overflow-hidden rounded-2xl bg-[var(--photo-bg)] shadow-[inset_0_0_0_1px_var(--line)]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={r.url} alt={`Customer reference picture ${i + 1}`} className="size-full object-contain p-1.5" />
                          <span className="sr-only"> (opens full size)</span>
                        </a>
                      ) : (
                        <span className="grid size-28 place-items-center rounded-2xl bg-ground-2 text-[0.8125rem] text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]">
                          Unavailable
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {o.design && (
              <div className="mt-5 flex flex-wrap items-start gap-4">
                {o.design.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.design.image} alt="The customer’s AI design" className="size-40 rounded-2xl bg-[var(--photo-bg)] object-contain shadow-[inset_0_0_0_1px_var(--line)]" />
                )}
                <div className="min-w-0 max-w-[48ch]">
                  <p className="voice-label text-[0.75rem] text-ink-2">AI design prompt</p>
                  <p className="mt-1 text-[0.9375rem] text-ink">{o.design.prompt}</p>
                </div>
              </div>
            )}
          </Section>

          {showPhotos && (
            <Section title="Finished photos" aside={<span className="text-[0.875rem] text-ink-2">The customer sees these</span>}>
              <PhotoManager id={o.id} photos={o.photos} canEdit={isOwner} />
            </Section>
          )}
        </div>

        <aside className="min-w-0">
          <Section title="Customer">
            {o.customer ? (
              <>
                <div className="flex items-center gap-3">
                  {o.customer.avatar_url && (
                    // The customer's own profile photo (public avatars bucket).
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.customer.avatar_url} alt="" className="size-11 shrink-0 rounded-full object-cover shadow-[inset_0_0_0_1px_var(--line)]" />
                  )}
                  <div className="min-w-0">
                    <p className="text-[1rem] font-semibold text-ink">{personName(o.customer)}</p>
                    <p className="text-[0.875rem] text-ink-2">@{o.customer.username}</p>
                  </div>
                </div>
                <ul className="mt-3 flex flex-col gap-1.5 text-[0.9375rem]">
                  {o.customer.phone && (
                    <li className="flex items-center gap-2">
                      <Phone aria-hidden="true" className="size-4 text-ink-2" />
                      <a href={`tel:${o.customer.phone.replace(/[^\d+]/g, "")}`} className="tabular text-ink hover:underline">
                        {o.customer.phone}
                      </a>
                    </li>
                  )}
                  {o.customer.email && (
                    <li className="flex min-w-0 items-center gap-2">
                      <Mail aria-hidden="true" className="size-4 shrink-0 text-ink-2" />
                      <a href={`mailto:${o.customer.email}`} className="min-w-0 truncate text-ink hover:underline">
                        {o.customer.email}
                      </a>
                    </li>
                  )}
                  {!o.customer.phone && !o.customer.email && (
                    <li className="text-ink-2">No phone or email on file. {isOwner ? "Reach them through chat." : "The owner can reach them through chat."}</li>
                  )}
                </ul>
              </>
            ) : (
              <p className="text-[0.9375rem] text-ink-2">Customer account not found.</p>
            )}
          </Section>

          {isOwner && chat && o.customer && (
            <Section
              title="Messages"
              aside={chat.total > chat.messages.length ? <span className="tabular text-[0.875rem] text-ink-2">Latest {chat.messages.length} of {chat.total}</span> : undefined}
            >
              {chat.error ? (
                <p className="text-[0.9375rem] text-ink-2">We couldn’t load the messages just now. The conversation is still a tap away.</p>
              ) : chat.messages.length === 0 ? (
                <p className="text-[0.9375rem] text-ink-2">Nothing about this order yet.</p>
              ) : (
                <ol className="flex flex-col gap-2.5">
                  {chat.messages.map((m) => (
                    <li key={m.id} className={`flex flex-col ${m.fromCustomer ? "items-start" : "items-end"}`}>
                      <p
                        className={`line-clamp-4 max-w-[90%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[0.875rem] leading-relaxed ${
                          m.fromCustomer ? "rounded-bl-md bg-ground-2 text-ink shadow-[inset_0_0_0_1px_var(--line)]" : "rounded-br-md bg-ink text-ground"
                        }`}
                      >
                        <span className="sr-only">{m.fromCustomer ? personName(o.customer) : "Shop"}: </span>
                        {m.message.trim() || "Sent a photo"}
                      </p>
                      <span className="tabular mt-0.5 px-1 text-[0.75rem] text-ink-2">
                        {dayLabel(m.created_at, now)}, {clock(m.created_at)}
                        {unreadFor(m, chat.ownerId) && <span className="font-semibold text-ink"> · New</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              <Link
                href={`/admin/chat/${o.customer.id}?order=${o.id}`}
                className="press mt-4 inline-flex h-11 items-center gap-2 rounded-xl px-4 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2"
              >
                <MessageCircle aria-hidden="true" className="size-4" />
                {chat.messages.length || chat.error ? "Open conversation" : `Message ${firstNameOf(o.customer)}`}
              </Link>
            </Section>
          )}

          <Section title="Price and payments">
            {o.total_price === null ? (
              <p className="text-[0.9375rem] text-ink-2">Not priced yet. Payments start once the order is accepted.</p>
            ) : (
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-[0.9375rem]">
                <dt className="text-ink-2">Total</dt>
                <dd className="voice-board tabular text-right text-[1.5rem] leading-none text-ink">{formatPeso(o.total_price)}</dd>
                <dt className="text-ink-2">Down payment (50%)</dt>
                <dd className="tabular text-right text-ink">
                  {formatPeso(downPayment(o.total_price))}
                  {money?.downMet && <span className="ml-1.5 text-[0.8125rem] font-semibold">· paid</span>}
                </dd>
                {money && (
                  <>
                    <dt className="text-ink-2">Paid so far</dt>
                    <dd className="tabular text-right text-ink">{formatPeso(money.paid)}</dd>
                    <dt className="font-semibold text-ink">{o.status === "cancelled" ? "Was still due" : "Still due"}</dt>
                    <dd className="tabular text-right font-semibold text-ink">{formatPeso(money.due)}</dd>
                    {money.waiting > 0 && (
                      <>
                        <dt className="text-ink-2">Waiting for review</dt>
                        <dd className="tabular text-right text-ink-2">{formatPeso(money.waiting)}</dd>
                      </>
                    )}
                  </>
                )}
              </dl>
            )}

            {money && money.payments.length > 0 && (
              <ul className="mt-4 border-t border-line">
                {money.payments.map((p) => (
                  <li key={p.id} className="border-b border-line">
                    <Link href={`/admin/payments/${p.id}`} className="press flex items-start justify-between gap-3 py-2.5 hover:bg-ground-2/60">
                      <span className="min-w-0">
                        <span className="tabular block text-[0.9375rem] font-semibold text-ink">{formatPeso(p.amount)}</span>
                        <span className="block text-[0.8125rem] text-ink-2">
                          {PAY_TYPE_LABEL[p.payment_type]} · {methodLine(p, true)} · {when(p.created_at)}
                        </span>
                      </span>
                      <PayPill status={p.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {money?.migrated && ["accepted", "in_progress", "ready", "completed"].includes(o.status) && money.due > 0 && o.customer && (
              <div className="mt-4">
                <RecordPayment orderId={o.id} customerId={o.customer.id} providers={providers} due={money.due} downLeft={Math.max(0, money.downDue - money.paid)} waiting={money.waiting} waitingId={money.waitingId} />
              </div>
            )}
            {money && !money.migrated && o.total_price !== null && !closed && (
              <p className="mt-3 text-[0.8125rem] text-ink-2">Recording payments needs the latest database update ({PAYMENTS_MIGRATION}).</p>
            )}

            {o.status === "cancelled" && money && money.paid > 0 && (
              <div className="mt-5 border-t border-line pt-4">
                <p className="text-[0.9375rem] font-semibold text-ink">Refunds</p>
                {money.refunds.length === 0 ? (
                  <p className="mt-1 text-[0.875rem] text-ink-2">Nothing given back yet. {formatPeso(money.paid)} was paid.</p>
                ) : (
                  <ul className="mt-1.5 flex flex-col gap-1.5 text-[0.875rem]">
                    {money.refunds.map((r) => (
                      <li key={r.id}>
                        <span className="tabular font-semibold text-ink">{formatPeso(r.amount)}</span>
                        <span className="text-ink-2"> · {r.method === "cash" ? "Cash" : "GCash"} · {when(r.created_at)} · {r.by}</span>
                        <span className="block text-ink-2">“{r.note}”</span>
                      </li>
                    ))}
                  </ul>
                )}
                {isOwner && money.migrated && money.paid - money.refunded > 0 && (
                  <div className="mt-3">
                    <RecordRefund orderId={o.id} left={Math.round((money.paid - money.refunded) * 100) / 100} />
                  </div>
                )}
              </div>
            )}
            {isOwner && o.status === "accepted" && (
              <div className="mt-5 border-t border-line pt-4">
                <ReviewPanel id={o.id} status={o.status} price={o.total_price} />
              </div>
            )}
          </Section>

          <Section title="History">
            <ol className="flex flex-col gap-3.5">
              {o.history.map((h) => (
                <li key={h.id} className="grid grid-cols-[0.75rem_minmax(0,1fr)] gap-x-3">
                  <span aria-hidden="true" className="mt-1.5 size-2 rounded-full bg-ink-2" />
                  <div className="min-w-0">
                    <p className="text-[0.9375rem] text-ink">
                      <span className="font-semibold">
                        {h.note && h.status === "in_progress" ? h.note : h.status === "pending" ? "Order placed" : STATUS_LABEL[h.status]}
                      </span>
                      {h.note && h.status !== "in_progress" && <span className="block text-[0.875rem] text-ink-2">“{h.note}”</span>}
                    </p>
                    <p className="tabular text-[0.8125rem] text-ink-2">
                      {when(h.created_at)} · {h.by}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          {isOwner && !closed && o.status !== "completed" && (
            <div className="mt-8 border-t border-line pt-4">
              <CancelOrderButton id={o.id} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
