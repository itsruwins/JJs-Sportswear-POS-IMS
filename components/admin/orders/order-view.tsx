import Link from "next/link";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { formatPeso } from "@/lib/admin/catalog";
import { downPayment, PRODUCTION_MIGRATION, STATUS_LABEL, STEPS, VIEWS, type OrderDetail, type OrderStatus, type OrderView } from "@/lib/admin/orders";
import { CancelOrderButton, HandoverPanel, OrderFlash, PhotoManager, ProductionChecklist, ReviewPanel } from "./order-actions";
import { ago, personName, StatusPill, when } from "./order-bits";

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
export function OrderView({ order: o, now = new Date(), backView = "open" }: { order: OrderDetail; now?: Date; backView?: OrderView }) {
  const closed = o.status === "declined" || o.status === "cancelled";
  const pieces = o.items.reduce((s, i) => s + i.quantity, 0);
  const cancelNote = o.status === "cancelled" ? o.history.find((h) => h.status === "cancelled")?.note : null;
  const steps = Object.fromEntries(
    Object.entries(o.steps).map(([k, v]) => [k, { ...v!, when: when(v!.done_at) }]),
  ) as Parameters<typeof ProductionChecklist>[0]["steps"];
  const stepsDone = STEPS.filter((s) => o.steps[s.id]).length;
  const showProduction = o.migrated && ["accepted", "in_progress", "ready", "completed"].includes(o.status);
  const showPhotos = o.migrated && ["in_progress", "ready", "completed"].includes(o.status);

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
              <p className="mb-4 max-w-[60ch] text-[0.9375rem] text-ink-2">
                Check what they asked for below, agree the details with the customer, then set the price to accept it.
              </p>
              <ReviewPanel id={o.id} status={o.status} price={o.total_price} />
            </Section>
          )}

          {o.status === "ready" && (
            <Section title="Hand over">
              <p className="mb-4 text-[0.9375rem] text-ink-2">Ready since {o.ready_at ? when(o.ready_at) : "today"}. The customer has been told it’s ready.</p>
              <HandoverPanel id={o.id} />
            </Section>
          )}

          {o.status === "completed" && (
            <Section title="Completed">
              <p className="text-[0.9375rem] text-ink-2">Picked up {o.completed_at ? when(o.completed_at) : ""}.</p>
            </Section>
          )}

          {showProduction && (
            <Section title="Production" aside={<span className="tabular text-[0.875rem] text-ink-2">{stepsDone} of 5 done</span>}>
              <ProductionChecklist id={o.id} status={o.status} steps={steps} />
            </Section>
          )}

          <Section title="What they ordered" aside={<span className="tabular text-[0.875rem] text-ink-2">{pieces} {pieces === 1 ? "piece" : "pieces"}</span>}>
            {o.items.length === 0 ? (
              <p className="text-[0.9375rem] text-ink-2">No items listed. Ask the customer for sizes and quantities.</p>
            ) : (
              <ul className="border-t border-line">
                {o.items.map((i) => (
                  <li key={i.id} className="flex items-start justify-between gap-4 border-b border-line py-3">
                    <div className="min-w-0">
                      <p className="text-[0.9375rem] font-semibold text-ink">{i.garment}</p>
                      <p className="text-[0.875rem] text-ink-2">{[i.color, i.size].filter(Boolean).join(" · ") || "No color or size given"}</p>
                      {i.notes && <p className="mt-0.5 text-[0.875rem] text-ink">{i.notes}</p>}
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
                    <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink">{o.notes}</p>
                  </div>
                )}
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
              <PhotoManager id={o.id} photos={o.photos} canEdit />
            </Section>
          )}
        </div>

        <aside className="min-w-0">
          <Section title="Customer">
            {o.customer ? (
              <>
                <p className="text-[1rem] font-semibold text-ink">{personName(o.customer)}</p>
                <p className="text-[0.875rem] text-ink-2">@{o.customer.username}</p>
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
                  {!o.customer.phone && !o.customer.email && <li className="text-ink-2">No phone or email on file. Reach them through chat.</li>}
                </ul>
              </>
            ) : (
              <p className="text-[0.9375rem] text-ink-2">Customer account not found.</p>
            )}
          </Section>

          <Section title="Price">
            {o.total_price === null ? (
              <p className="text-[0.9375rem] text-ink-2">Not priced yet.</p>
            ) : (
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-[0.9375rem]">
                <dt className="text-ink-2">Total</dt>
                <dd className="voice-board tabular text-right text-[1.5rem] leading-none text-ink">{formatPeso(o.total_price)}</dd>
                <dt className="text-ink-2">Down payment (50%)</dt>
                <dd className="tabular text-right font-semibold text-ink">{formatPeso(downPayment(o.total_price))}</dd>
                <dt className="text-ink-2">Balance at pickup</dt>
                <dd className="tabular text-right text-ink">{formatPeso(o.total_price - downPayment(o.total_price))}</dd>
              </dl>
            )}
            {o.total_price !== null && !closed && (
              <p className="mt-3 text-[0.8125rem] text-ink-2">Payments aren’t recorded here yet; that comes with the Payments update.</p>
            )}
            {o.status === "accepted" && (
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

          {!closed && o.status !== "completed" && (
            <div className="mt-8 border-t border-line pt-4">
              <CancelOrderButton id={o.id} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
