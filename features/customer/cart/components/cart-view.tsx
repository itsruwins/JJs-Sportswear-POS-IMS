"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatPeso } from "@/features/shared/catalog/catalog";
import { downPaymentOf, type TicketKind } from "@/features/shared/tickets/model";
import { PageHeader, pageShell } from "@/features/customer/shell/components/page-parts";
import { setCartQuantity } from "@/features/customer/cart/actions";
import {
  CART_MIGRATION,
  cartSummary,
  designRuns,
  designSummary,
  isReadyLine,
  lineState,
  piecesLabel,
  type CartLine,
} from "@/features/customer/cart/model";
import type { TicketSummary } from "@/features/customer/tickets/data";
import { GetTicketButton } from "@/features/customer/tickets/components/ticket-parts";
import { CartRow, DesignCard, SectionTitle, ShopDetails } from "./cart-parts";

type Change = { line: CartLine; quantity: number };

/** The last lines taken out (one size, or a design's whole run), so a slip is one tap to undo. */
type Removed = { lines: CartLine[]; label: string };

/**
 * The cart: what the customer means to buy at the counter, in two parts that each get their own
 * ticket. Ready-made items are read against today's stock; designs are made after ordering, so
 * they're size runs with the down payment they'll need. Changes show at once and save behind
 * the scenes; the page then re-reads the cart, so another device's changes land here too.
 */
export function CartView({
  lines,
  problem,
  openTickets,
}: {
  lines: CartLine[];
  problem: "missing" | "error" | null;
  /** Tickets already waiting for the counter, one of each kind at most: a new one takes its items in. */
  openTickets: Record<TicketKind, TicketSummary | null>;
}) {
  const [shown, apply] = useOptimistic(lines, (state: CartLine[], changes: Change[]) =>
    changes.reduce((acc, { line, quantity }) => {
      if (quantity <= 0) return acc.filter((l) => l.variantId !== line.variantId);
      // Undo puts a removed line back at the end, where the saved cart will have it too.
      if (!acc.some((l) => l.variantId === line.variantId)) return [...acc, { ...line, quantity }];
      return acc.map((l) => (l.variantId === line.variantId ? { ...l, quantity } : l));
    }, state),
  );
  const [, startSaving] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Removed | null>(null);

  const changeAll = (changes: Change[], label?: string) => {
    setMessage(null);
    if (changes.every((c) => c.quantity <= 0) && label) setRemoved({ lines: changes.map((c) => c.line), label });
    else setRemoved(null);
    startSaving(async () => {
      apply(changes);
      for (const { line, quantity } of changes) {
        const r = await setCartQuantity(line.variantId, Math.max(0, quantity));
        if (!r.ok) {
          setMessage(r.message);
          return;
        }
        if (r.capped) setMessage(`Only ${r.quantity} left in that size and color, so your cart has ${r.quantity}.`);
      }
    });
  };
  const change = (line: CartLine, quantity: number) => {
    const label = line.item ? (line.item.madeToOrder ? `${line.item.name}, ${line.item.color}, size ${line.item.size}` : `${line.item.name}, ${line.item.size} · ${line.item.color}`) : "the item";
    changeAll([{ line, quantity }], quantity <= 0 ? label : undefined);
  };

  const undo = () => {
    if (!removed) return;
    const { lines: back } = removed;
    setRemoved(null);
    changeAll(back.map((line) => ({ line, quantity: line.quantity })));
  };

  const ready = shown.filter(isReadyLine);
  const runs = designRuns(shown);
  const { pieces, total } = cartSummary(ready);
  const designs = designSummary(runs);
  const both = ready.length > 0 && runs.length > 0;
  const needsLook = ready.filter((l) => lineState(l) === "short" || lineState(l) === "sold_out" || lineState(l) === "unavailable").length;

  return (
    <div className={pageShell}>
      <PageHeader
        title="Your cart"
        sub="What you plan to get at the shop. Ready-made pieces aren’t set aside, so stock can change; designs are made after you order at the counter."
      />

      {!problem && (openTickets.ready || openTickets.design) && (
        <div className="mb-8 flex max-w-[46rem] flex-col gap-2.5">
          {openTickets.ready && <OpenTicketRow ticket={openTickets.ready} taken={ready.length > 0} />}
          {openTickets.design && <OpenTicketRow ticket={openTickets.design} taken={runs.length > 0} />}
        </div>
      )}

      {problem ? (
        <p role="alert" className="auth-alert max-w-[46rem] rounded-2xl px-5 py-4 text-[0.9375rem]">
          {problem === "missing"
            ? `The cart needs the latest database update (${CART_MIGRATION}). Ask the shop to run it.`
            : "We couldn’t load your cart just now. Check your connection, then refresh the page."}
        </p>
      ) : shown.length === 0 ? (
        <>
          <Status message={message} removed={removed} onUndo={undo} />
          <EmptyCart />
        </>
      ) : (
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
          <div className="flex min-w-0 flex-col gap-12">
            <Status message={message} removed={removed} onUndo={undo} first />

            {ready.length > 0 && (
              <section aria-labelledby="cart-ready-title" className="min-w-0">
                <SectionTitle
                  id="cart-ready-title"
                  aside={<span className="tabular text-[0.9375rem] text-ink-2">{piecesLabel(ready.reduce((n, l) => n + l.quantity, 0))}</span>}
                >
                  Ready-made
                </SectionTitle>
                {needsLook > 0 && (
                  <p className="mt-4 text-[0.9375rem] font-semibold text-ink">
                    {needsLook === 1 ? "One item changed since you added it." : `${needsLook} items changed since you added them.`} See below.
                  </p>
                )}
                <ul>
                  {ready.map((l) => (
                    <CartRow key={l.variantId} line={l} onQuantity={(q) => change(l, q)} />
                  ))}
                </ul>
              </section>
            )}

            {runs.length > 0 && (
              <section aria-labelledby="cart-designs-title" className="min-w-0">
                <SectionTitle id="cart-designs-title" aside={<span className="tabular text-[0.9375rem] text-ink-2">{piecesLabel(designs.pieces)}</span>}>
                  Made to order
                </SectionTitle>
                <ul>
                  {runs.map((r) => (
                    <DesignCard
                      key={r.key}
                      run={r}
                      onQuantity={change}
                      onRemove={() =>
                        changeAll(
                          r.lines.map((line) => ({ line, quantity: 0 })),
                          `${r.name}, ${r.style} (${piecesLabel(r.pieces)})`,
                        )
                      }
                    />
                  ))}
                </ul>
              </section>
            )}

            <Link
              href="/shop"
              className="press -mt-7 -ml-4 inline-flex h-11 items-center gap-1.5 self-start rounded-full px-4 text-[0.9375rem] font-semibold text-ink hover:bg-ground-2"
            >
              Keep shopping
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>

          <aside className="flex min-w-0 flex-col gap-12">
            <section aria-labelledby="cart-total-title">
              <SectionTitle id="cart-total-title">Estimated total</SectionTitle>

              {ready.length > 0 && (
                <div>
                  {both && <h3 className="mt-4 text-[0.9375rem] font-semibold text-ink">Ready-made</h3>}
                  <dl className="mt-1 text-[0.9375rem]">
                    <div className="flex items-baseline justify-between gap-3 py-2.5">
                      <dt className="text-ink-2">Pieces on the rack</dt>
                      <dd className="tabular text-ink">{pieces}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-t border-line py-2.5">
                      <dt className="font-semibold text-ink">Total</dt>
                      <dd className="voice-board tabular text-[1.75rem] leading-none text-ink">{formatPeso(total)}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 max-w-[38ch] text-[0.875rem] leading-relaxed text-ink-2">
                    The counter charges the day’s price. Sold-out pieces aren’t counted.
                  </p>
                  <div className="mt-6">
                    <GetTicketButton kind="ready" disabled={pieces === 0} folds={openTickets.ready?.code ?? null} tone={both ? "ink" : "action"} />
                    {pieces > 0 && needsLook > 0 && (
                      <p className="mt-2 text-[0.875rem] leading-relaxed text-ink-2">Sold-out items stay in your cart.</p>
                    )}
                  </div>
                </div>
              )}

              {runs.length > 0 && (
                <div className={both ? "mt-10 border-t border-line pt-6" : ""}>
                  {both && <h3 className="text-[0.9375rem] font-semibold text-ink">Made to order</h3>}
                  <dl className="mt-1 text-[0.9375rem]">
                    <div className="flex items-baseline justify-between gap-3 py-2.5">
                      <dt className="text-ink-2">Pieces to make</dt>
                      <dd className="tabular text-ink">{designs.pieces}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-t border-line py-2.5">
                      <dt className="font-semibold text-ink">Total</dt>
                      <dd className="voice-board tabular text-[1.75rem] leading-none text-ink">{formatPeso(designs.total)}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-t border-line py-2.5">
                      <dt className="text-ink-2">At least half down</dt>
                      <dd className="tabular font-semibold text-ink">{formatPeso(downPaymentOf(designs.total))}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 max-w-[38ch] text-[0.875rem] leading-relaxed text-ink-2">
                    Made after you order at the counter: at least half then, the rest at pickup. The counter charges the day’s price.
                  </p>
                  <div className="mt-6">
                    <GetTicketButton kind="design" disabled={designs.pieces === 0} folds={openTickets.design?.code ?? null} tone={both ? "ink" : "action"} />
                  </div>
                </div>
              )}
            </section>

            <section aria-labelledby="cart-shop-title">
              <SectionTitle id="cart-shop-title">At the shop</SectionTitle>
              <ShopDetails />
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

/** A ticket already made: where to find it, and what a new one of its kind does with it. */
function OpenTicketRow({ ticket: t, taken }: { ticket: TicketSummary; taken: boolean }) {
  const design = t.kind === "design";
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl bg-ground-2 py-3 pl-4 pr-2 shadow-[inset_0_0_0_1px_var(--line)]">
      <p className="min-w-0 text-[0.9375rem] leading-snug text-ink">
        <span className="font-semibold">
          {design ? "Design ticket" : "Ticket"} <span className="tabular whitespace-nowrap">{t.code}</span> is ready for the counter
        </span>
        <span className="text-ink-2">
          {" "}
          · <span className="tabular">{piecesLabel(t.pieces)}</span>
          {taken ? `. A new ${design ? "design ticket takes its designs" : "ticket takes its items"} in.` : "."}
        </span>
      </p>
      <Link
        href={`/orders/tickets/${t.code}`}
        className="press inline-flex h-10 shrink-0 items-center gap-1 rounded-full px-3 text-[0.9375rem] font-semibold text-ink underline underline-offset-4 hover:bg-ground hover:no-underline"
      >
        View ticket
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </div>
  );
}

/** What the last change did: a refusal, or Undo for what was just removed. */
function Status({ message, removed, onUndo, first = false }: { message: string | null; removed: Removed | null; onUndo: () => void; first?: boolean }) {
  return (
    <div aria-live="polite" className={`empty:hidden ${first ? "-mb-8" : ""}`}>
      {message ? (
        <p className={`${first ? "" : "mt-4 "}text-[0.9375rem] font-semibold text-ink`}>{message}</p>
      ) : removed ? (
        <div className={`${first ? "" : "mt-4 "}flex items-center justify-between gap-3 rounded-2xl bg-ground-2 py-2 pl-4 pr-2 shadow-[inset_0_0_0_1px_var(--line)]`}>
          <p className="min-w-0 text-[0.9375rem] text-ink">
            Removed <span className="font-semibold">{removed.label}</span>.
          </p>
          <button
            type="button"
            onClick={onUndo}
            className="press inline-flex h-10 shrink-0 items-center rounded-full px-3 text-[0.9375rem] font-semibold text-ink underline underline-offset-4 hover:bg-ground hover:no-underline"
          >
            Undo
          </button>
        </div>
      ) : null}
    </div>
  );
}

function EmptyCart() {
  return (
    <section className="mt-2 max-w-[46rem] rounded-[1.25rem] bg-ground-2 px-5 py-6 shadow-[inset_0_0_0_1px_var(--line)] sm:px-7 sm:py-7">
      <h2 className="text-[1.125rem] font-semibold leading-snug text-ink">Your cart is empty.</h2>
      <p className="mt-2 max-w-[52ch] text-[0.9375rem] leading-relaxed text-ink-2">
        Pick a size on a ready-made item, or a style and how many of each size on a design, and tap Add to cart. It waits here, on any
        device you log in on, until you’re at the counter.
      </p>
      <Link
        href="/shop"
        className="press mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-action px-5 text-[0.9375rem] font-semibold text-action-ink hover:bg-action-deep"
      >
        Go to the shop
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </section>
  );
}
