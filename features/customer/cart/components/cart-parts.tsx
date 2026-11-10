"use client";

import { useState } from "react";
import Link from "next/link";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { formatPeso } from "@/features/shared/catalog/catalog";
import { GarmentArt } from "@/features/customer/shop/components/garment-art";
import { lineState, MAX_PER_LINE, piecesLabel, type CartLine, type DesignRun } from "@/features/customer/cart/model";
import { SHOP } from "@/lib/shop";

export function SectionTitle({ id, children, aside }: { id: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line pb-3">
      <h2 id={id} className="voice-display text-[1.75rem]">
        {children}
      </h2>
      {aside}
    </div>
  );
}

const fixButton =
  "press inline-flex h-8 shrink-0 items-center rounded-full bg-ground px-3 text-[0.8125rem] font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--ink)] hover:bg-ground-2";

/**
 * One line of the cart: the garment, what it is, a stepper, its total, and Remove. A line
 * that no longer fits today's stock says so underneath with the one fix that clears it.
 */
export function CartRow({ line: l, onQuantity }: { line: CartLine; onQuantity: (quantity: number) => void }) {
  const state = lineState(l);
  const item = l.item;
  const name = item?.name ?? "An item the shop no longer sells";
  const full = item ? `${item.name}, size ${item.size}, ${item.color}` : name;
  const counted = item && (state === "ok" || state === "low" || state === "short") ? Math.min(l.quantity, item.stock) : 0;

  return (
    <li className="flex gap-4 border-b border-line py-4 sm:gap-5">
      {item ? (
        <Link href={`/shop/${item.productId}`} tabIndex={-1} aria-hidden="true" className="shop-tile size-20 shrink-0 rounded-xl sm:size-24">
          <GarmentArt image={item.image} color={item.color} name={item.name} className="shop-thumb-art" sizes="6rem" />
        </Link>
      ) : (
        <div aria-hidden="true" className="grid size-20 shrink-0 place-items-center rounded-xl bg-ground-2 shadow-[inset_0_0_0_1px_var(--line)] sm:size-24">
          <ShoppingBag className="size-6 text-ink-2" strokeWidth={1.6} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {item ? (
              <Link href={`/shop/${item.productId}`} className="text-[1rem] font-semibold leading-snug text-ink hover:underline hover:underline-offset-4">
                {item.name}
              </Link>
            ) : (
              <p className="text-[1rem] font-semibold leading-snug text-ink-2">{name}</p>
            )}
            {item && (
              <p className="tabular mt-0.5 text-[0.9375rem] text-ink-2">
                {item.size} · {item.color} · {formatPeso(item.price)}
              </p>
            )}
          </div>
          <p className={`tabular shrink-0 text-right text-[1rem] font-semibold ${counted ? "text-ink" : "text-ink-2"}`}>
            {counted ? formatPeso(counted * item!.price) : "—"}
          </p>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          {item && state !== "sold_out" ? (
            <Stepper key={l.quantity} label={full} quantity={l.quantity} max={Math.min(item.stock, MAX_PER_LINE)} onQuantity={onQuantity} />
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => onQuantity(0)}
            aria-label={`Remove ${full}`}
            className="press -mr-2 inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[0.9375rem] font-semibold text-ink-2 hover:bg-ground-2 hover:text-ink"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Remove
          </button>
        </div>

        {state === "low" && item && (
          <p className="mt-2.5 flex items-center gap-2 text-[0.875rem] text-ink-2">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-signal" />
            <span>
              <span className="tabular font-semibold text-ink">Only {item.stock} left</span> at the shop right now.
            </span>
          </p>
        )}
        {state === "short" && item && (
          <div role="status" className="auth-alert mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-[0.875rem]">
            <span className="tabular">Only {item.stock} left now, so only those are counted.</span>
            <button type="button" onClick={() => onQuantity(item.stock)} className={fixButton}>
              Change to {item.stock}
            </button>
          </div>
        )}
        {state === "sold_out" && (
          <p role="status" className="auth-alert mt-3 rounded-xl px-3 py-2 text-[0.875rem]">
            Sold out in this size and color for now, so it isn’t counted.
          </p>
        )}
        {state === "unavailable" && (
          <p className="mt-2 text-[0.875rem] text-ink-2">It was taken off the shop, so it can’t be bought anymore.</p>
        )}
      </div>
    </li>
  );
}

/**
 * One design in one style: its photo, name and style, each size with its own stepper, the run's
 * total, and Remove for the whole run. A size's − at 1 takes that size out.
 */
export function DesignCard({
  run,
  onQuantity,
  onRemove,
}: {
  run: DesignRun;
  onQuantity: (line: CartLine, quantity: number) => void;
  onRemove: () => void;
}) {
  const prices = run.lines.map((l) => l.item.price);
  const each = Math.min(...prices) === Math.max(...prices) ? formatPeso(prices[0]) : `${formatPeso(Math.min(...prices))}–${formatPeso(Math.max(...prices))}`;
  const title = `${run.name}, ${run.style}`;
  return (
    <li className="flex gap-4 border-b border-line py-4 sm:gap-5">
      <Link href={`/shop/${run.productId}`} tabIndex={-1} aria-hidden="true" className="shop-tile size-20 shrink-0 rounded-xl sm:size-24">
        <GarmentArt image={run.image} color={null} name={run.name} className="shop-thumb-art" sizes="6rem" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/shop/${run.productId}`} className="text-[1rem] font-semibold leading-snug text-ink hover:underline hover:underline-offset-4">
              {run.name}
            </Link>
            <p className="tabular mt-0.5 text-[0.9375rem] text-ink-2">
              {run.style} · {each} each · {piecesLabel(run.pieces)}
            </p>
          </div>
          <p className="tabular shrink-0 text-right text-[1rem] font-semibold text-ink">{formatPeso(run.total)}</p>
        </div>

        <ul aria-label={`${title}, sizes`} className="mt-3 flex flex-wrap gap-x-4 gap-y-2.5">
          {run.lines.map((l) => (
            <li key={l.variantId} className="flex items-center gap-2">
              <span className="tabular w-9 text-right text-[0.9375rem] font-semibold text-ink">{l.item.size}</span>
              <Stepper
                key={l.quantity}
                label={`${title}, size ${l.item.size}`}
                quantity={l.quantity}
                max={MAX_PER_LINE}
                onQuantity={(q) => onQuantity(l, q)}
                removable
              />
            </li>
          ))}
        </ul>

        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${title}, every size`}
            className="press -mr-2 inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[0.9375rem] font-semibold text-ink-2 hover:bg-ground-2 hover:text-ink"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * − / count / +, the count typed too (saved on Enter or leaving the field). − stops at 1, unless
 * the line is one size of a design (`removable`), where it takes that size out.
 */
function Stepper({
  label,
  quantity,
  max,
  onQuantity,
  removable = false,
}: {
  label: string;
  quantity: number;
  max: number;
  onQuantity: (q: number) => void;
  removable?: boolean;
}) {
  const [draft, setDraft] = useState(String(quantity));
  const commit = () => {
    const n = parseInt(draft, 10);
    if (!Number.isFinite(n) || n === quantity) return setDraft(String(quantity));
    // Typing 0 removes the line, the same as Remove; above stock is lowered to it.
    onQuantity(Math.max(0, Math.min(n, max)));
  };
  return (
    <div role="group" aria-label={`${label}, quantity`} className="flex items-center rounded-full shadow-[inset_0_0_0_1px_var(--line)]">
      <button
        type="button"
        onClick={() => onQuantity(quantity - 1)}
        disabled={quantity <= (removable ? 0 : 1)}
        aria-label={removable && quantity <= 1 ? `Take out ${label}` : "One fewer"}
        className="press grid size-10 place-items-center rounded-full text-ink hover:bg-ground-2 disabled:text-ink-2 disabled:opacity-50 disabled:hover:bg-transparent"
      >
        <Minus aria-hidden="true" className="size-4" />
      </button>
      <input
        inputMode="numeric"
        aria-label="Quantity"
        value={draft}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 2))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(String(quantity));
            e.currentTarget.blur();
          }
        }}
        className="tabular h-10 w-10 bg-transparent text-center text-[1rem] font-semibold text-ink outline-none focus-visible:rounded-md focus-visible:shadow-[0_0_0_2px_var(--focus)]"
      />
      <button
        type="button"
        onClick={() => onQuantity(quantity + 1)}
        disabled={quantity >= max}
        aria-label={quantity >= max ? `No more left in ${label}` : "One more"}
        className="press grid size-10 place-items-center rounded-full text-ink hover:bg-ground-2 disabled:text-ink-2 disabled:opacity-50 disabled:hover:bg-transparent"
      >
        <Plus aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

/** Where the cart is paid for: the shop's details, "to follow" in muted ink until they're set. */
export function ShopDetails() {
  const row = "grid grid-cols-[5rem_minmax(0,1fr)] gap-3 border-t border-line py-3 first:border-t-0";
  return (
    <dl className="text-[0.9375rem]">
      <div className={row}>
        <dt className="text-ink-2">Where</dt>
        <dd className="text-ink">
          {SHOP.name}
          <br />
          {SHOP.address ?? <span className="text-ink-2">Street address to follow</span>}, {SHOP.city}
        </dd>
      </div>
      <div className={row}>
        <dt className="text-ink-2">Hours</dt>
        <dd className={SHOP.hours ? "text-ink" : "text-ink-2"}>{SHOP.hours ?? "Store hours to follow"}</dd>
      </div>
      <div className={row}>
        <dt className="text-ink-2">Phone</dt>
        <dd className={SHOP.phone ? "tabular text-ink" : "text-ink-2"}>{SHOP.phone ?? "Contact number to follow"}</dd>
      </div>
      <div className={row}>
        <dt className="text-ink-2">Pay with</dt>
        <dd className="text-ink">Cash or e-payment at the counter</dd>
      </div>
    </dl>
  );
}
