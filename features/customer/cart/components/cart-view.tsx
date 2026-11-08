"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Store } from "lucide-react";
import { formatPeso } from "@/features/shared/catalog/catalog";
import { PageHeader, pageShell } from "@/features/customer/shell/components/page-parts";
import { setCartQuantity } from "@/features/customer/cart/actions";
import { CART_MIGRATION, cartSummary, lineState, piecesLabel, type CartLine } from "@/features/customer/cart/model";
import { CartRow, SectionTitle, ShopDetails } from "./cart-parts";

type Change = { line: CartLine; quantity: number };

/** The last line taken out, so a slip is one tap to undo. */
type Removed = { line: CartLine; label: string };

/**
 * The cart: what the customer means to buy at the counter, against today's stock, with an
 * estimated total and the shop's details. Changes show at once and save behind the scenes;
 * the page then re-reads the cart, so another device's changes land here too.
 */
export function CartView({ lines, problem }: { lines: CartLine[]; problem: "missing" | "error" | null }) {
  const [shown, apply] = useOptimistic(lines, (state: CartLine[], { line, quantity }: Change) => {
    if (quantity <= 0) return state.filter((l) => l.variantId !== line.variantId);
    // Undo puts a removed line back at the end, where the saved cart will have it too.
    if (!state.some((l) => l.variantId === line.variantId)) return [...state, { ...line, quantity }];
    return state.map((l) => (l.variantId === line.variantId ? { ...l, quantity } : l));
  });
  const [, startSaving] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Removed | null>(null);

  const change = (line: CartLine, quantity: number) => {
    setMessage(null);
    if (quantity <= 0) setRemoved({ line, label: line.item ? `${line.item.name}, ${line.item.size} · ${line.item.color}` : "the item" });
    else setRemoved(null);
    startSaving(async () => {
      apply({ line, quantity });
      const r = await setCartQuantity(line.variantId, Math.max(0, quantity));
      if (!r.ok) setMessage(r.message);
      else if (r.capped) setMessage(`Only ${r.quantity} left in that size and color, so your cart has ${r.quantity}.`);
    });
  };

  const undo = () => {
    if (!removed) return;
    const { line } = removed;
    setRemoved(null);
    change(line, line.quantity);
  };

  const { pieces, total } = cartSummary(shown);
  const needsLook = shown.filter((l) => lineState(l) === "short" || lineState(l) === "sold_out" || lineState(l) === "unavailable").length;

  return (
    <div className={pageShell}>
      <PageHeader
        title="Your cart"
        sub="What you plan to buy at the shop. Pieces aren’t set aside, so stock can change before you get there."
      />

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
          <section aria-labelledby="cart-items-title" className="min-w-0">
            <SectionTitle
              id="cart-items-title"
              aside={<span className="tabular text-[0.9375rem] text-ink-2">{piecesLabel(shown.reduce((n, l) => n + l.quantity, 0))}</span>}
            >
              Items
            </SectionTitle>
            <Status message={message} removed={removed} onUndo={undo} />
            {needsLook > 0 && (
              <p className="mt-4 text-[0.9375rem] font-semibold text-ink">
                {needsLook === 1 ? "One item changed since you added it." : `${needsLook} items changed since you added them.`} See below.
              </p>
            )}
            <ul>
              {shown.map((l) => (
                <CartRow key={l.variantId} line={l} onQuantity={(q) => change(l, q)} />
              ))}
            </ul>
            <Link
              href="/shop"
              className="press mt-5 inline-flex h-11 items-center gap-1.5 rounded-full px-4 -ml-4 text-[0.9375rem] font-semibold text-ink hover:bg-ground-2"
            >
              Keep shopping
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </section>

          <aside className="flex min-w-0 flex-col gap-12">
            <section aria-labelledby="cart-total-title">
              <SectionTitle id="cart-total-title">Estimated total</SectionTitle>
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
              <div className="mt-6 rounded-2xl bg-ground-2 px-4 py-4 shadow-[inset_0_0_0_1px_var(--line)]">
                <p className="flex items-center gap-2 text-[0.9375rem] font-semibold text-ink">
                  <Store aria-hidden="true" className="size-4 shrink-0" />
                  Buying it at the shop
                </p>
                <p className="mt-1.5 text-[0.875rem] leading-relaxed text-ink-2">
                  Show this cart at the counter, and staff will pull your sizes from the rack.
                </p>
                <p className="voice-label mt-3 inline-flex items-center gap-2 text-[0.8125rem] text-ink-2">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-ink-2" />
                  A counter ticket for your cart comes in the next update
                </p>
              </div>
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

/** What the last change did: a refusal, or Undo for a line just removed. */
function Status({ message, removed, onUndo }: { message: string | null; removed: Removed | null; onUndo: () => void }) {
  return (
    <div aria-live="polite" className="empty:hidden">
      {message ? (
        <p className="mt-4 text-[0.9375rem] font-semibold text-ink">{message}</p>
      ) : removed ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-ground-2 py-2 pl-4 pr-2 shadow-[inset_0_0_0_1px_var(--line)]">
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
        Pick a size on any ready-made item and tap Add to cart. It waits here, on any device you log in on, until you’re at the
        counter.
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
