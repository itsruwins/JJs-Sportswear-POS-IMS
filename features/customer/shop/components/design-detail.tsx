"use client";

import { useRef, useState, useTransition } from "react";
import { LoaderCircle, Minus, Plus, ShoppingBag } from "lucide-react";
import { formatPeso } from "@/features/shared/catalog/catalog";
import { downPaymentOf } from "@/features/shared/tickets/model";
import type { ShopProduct, ShopVariant } from "@/features/customer/shop/model";
import { AskShop } from "@/features/customer/chat/components/ask-shop";
import { addRunToCart } from "@/features/customer/cart/actions";
import { CartNote, type AddNote } from "@/features/customer/cart/components/cart-note";
import { MAX_PER_LINE, piecesLabel, runLabel } from "@/features/customer/cart/model";
import { GarmentArt } from "./garment-art";

/**
 * A made-to-order design's page: its photos, the styles with their prices, and a size run.
 * Each size counts its own pieces (tap to add one), so a team's whole run goes into the cart
 * in one tap. The order itself is taken at the counter from the design ticket.
 */
export function DesignDetail({ product: p, inCart }: { product: ShopProduct; inCart: Record<string, number> }) {
  const photos = p.images.length ? p.images : p.image ? [p.image] : [];
  const [photo, setPhoto] = useState(0);
  const [style, setStyle] = useState<string | null>(p.colors.length === 1 ? p.colors[0] : null);
  // Pieces wanted per variant (so each style keeps its own run while the customer compares).
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [need, setNeed] = useState<"style" | "sizes" | null>(null);
  const [adding, startAdding] = useTransition();
  const [note, setNote] = useState<AddNote | null>(null);
  const styleGroup = useRef<HTMLFieldSetElement>(null);
  const sizeGroup = useRef<HTMLFieldSetElement>(null);

  const priceOf = (st: string) => {
    const prices = p.variants.filter((v) => v.color === st).map((v) => v.price);
    return prices.length ? Math.min(...prices) : p.priceMin;
  };
  const variantOf = (size: string) => (style ? (p.variants.find((v) => v.color === style && v.size === size) ?? null) : null);
  const label = p.designNumber !== null ? `design ${p.designNumber} (${p.name})` : p.name;

  // The run being built for the chosen style, in size order.
  const run = style
    ? p.sizes.flatMap((s) => {
        const v = variantOf(s);
        const q = v ? (counts[v.id] ?? 0) : 0;
        return v && q > 0 ? [{ variant: v, size: s, quantity: q }] : [];
      })
    : [];
  const pieces = run.reduce((n, r) => n + r.quantity, 0);
  const total = run.reduce((n, r) => n + r.quantity * r.variant.price, 0);

  // What's already in the cart of this design, for the chosen style.
  const carted = style
    ? p.sizes.flatMap((s) => {
        const v = variantOf(s);
        const q = v ? (inCart[v.id] ?? 0) : 0;
        return q > 0 ? [{ size: s, quantity: q }] : [];
      })
    : [];

  const setCount = (v: ShopVariant, q: number) => {
    setCounts((c) => ({ ...c, [v.id]: Math.max(0, Math.min(MAX_PER_LINE, q)) }));
    setNeed(null);
    setNote(null);
  };

  const pickStyle = (st: string) => {
    setStyle(st);
    setNeed(null);
    setNote(null);
  };

  const add = () => {
    if (adding) return;
    if (!style) {
      setNeed("style");
      styleGroup.current?.querySelector<HTMLButtonElement>("button")?.focus();
      return;
    }
    if (pieces === 0) {
      setNeed("sizes");
      sizeGroup.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
      return;
    }
    const sent = run;
    startAdding(async () => {
      const r = await addRunToCart(sent.map((x) => ({ variantId: x.variant.id, quantity: x.quantity })));
      if (!r.ok) {
        setNote({ kind: "problem", text: r.message });
        return;
      }
      setCounts((c) => {
        const next = { ...c };
        for (const x of sent) delete next[x.variant.id];
        return next;
      });
      setNote({ kind: "added", label: `${style}: ${runLabel(sent)}`, quantity: r.pieces, unit: "in these sizes" });
    });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-14">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="shop-tile aspect-square">
          <GarmentArt image={photos[photo] ?? null} color={null} name={p.name} className="shop-detail-art" sizes="(min-width: 1024px) 55vw, 100vw" />
        </div>
        {photos.length > 1 && (
          <ul aria-label="Photos" className="mt-3 grid grid-cols-6 gap-2">
            {photos.map((src, i) => (
              <li key={src}>
                <button
                  type="button"
                  aria-pressed={i === photo}
                  aria-label={`Photo ${i + 1} of ${photos.length}`}
                  onClick={() => setPhoto(i)}
                  className="press block w-full rounded-xl"
                >
                  <span className="shop-tile block aspect-square rounded-xl" data-current={i === photo ? "true" : undefined}>
                    <GarmentArt image={src} color={null} name="" className="shop-thumb-art" sizes="5rem" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="min-w-0">
        <h1 className="voice-display text-[clamp(2.25rem,4.5vw,3.5rem)]">{p.name}</h1>
        <p className="mt-2 text-[1rem] text-ink-2">
          Made to order{p.designNumber !== null && <> · Design {p.designNumber}</>}
        </p>
        <p className="tabular mt-4 text-[1.25rem] font-semibold text-ink">
          {style ? `${formatPeso(priceOf(style))} each` : `From ${formatPeso(p.priceMin)}`}
        </p>

        {/* Style */}
        <fieldset ref={styleGroup} className="mt-8" aria-describedby={need === "style" ? "design-need" : undefined}>
          <legend className="text-[0.9375rem] text-ink-2">
            Style{style && <>: <span className="font-semibold text-ink">{style}</span></>}
          </legend>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {p.colors.map((st) => (
              <button key={st} type="button" aria-pressed={st === style} onClick={() => pickStyle(st)} className="shop-size press min-h-[4.25rem] px-3">
                <span className="text-[0.9375rem] font-semibold">{st}</span>
                <span className="shop-size-left tabular">{formatPeso(priceOf(st))} each</span>
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-[0.875rem] leading-relaxed text-ink-2">
            A set is the jersey and shorts; upper is the jersey alone. NBA cut has deeper armholes and narrower shoulders.
          </p>
        </fieldset>

        {/* Size run */}
        <fieldset ref={sizeGroup} className="mt-8" aria-describedby={need === "sizes" ? "design-need" : "design-run"}>
          <legend className="flex w-full items-baseline justify-between gap-3 text-[0.9375rem]">
            <span className="font-semibold text-ink">How many of each size</span>
            <span className="text-[0.875rem] text-ink-2">Every size is made to order</span>
          </legend>
          <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(6.25rem,1fr))] gap-2">
            {p.sizes.map((s) => {
              const v = variantOf(s);
              const q = v ? (counts[v.id] ?? 0) : 0;
              const offered = !style || !!v;
              return (
                <SizeCounter
                  key={s}
                  size={s}
                  count={q}
                  disabled={!offered}
                  onAdd={() => {
                    if (!style || !v) {
                      setNeed("style");
                      styleGroup.current?.querySelector<HTMLButtonElement>("button")?.focus();
                      return;
                    }
                    setCount(v, q + 1);
                  }}
                  onCount={(n) => v && setCount(v, n)}
                />
              );
            })}
          </div>
          {need && (
            <p id="design-need" role="alert" className="mt-3 text-[0.9375rem] font-semibold text-ink">
              {need === "style" ? "Pick a style first, so the counter knows what to make." : "Tap a size to add a piece, then set how many of each."}
            </p>
          )}
        </fieldset>

        <div id="design-run" aria-live="polite" className="mt-4 text-[0.9375rem]">
          {pieces > 0 ? (
            <p className="text-ink-2">
              <span className="font-semibold text-ink">{style}:</span> <span className="tabular text-ink">{runLabel(run)}</span> ·{" "}
              <span className="tabular">{piecesLabel(pieces)}</span> · <span className="tabular font-semibold text-ink">{formatPeso(total)}</span>
              <span className="mt-0.5 block text-[0.875rem]">
                At least <span className="tabular">{formatPeso(downPaymentOf(total))}</span> down when you order at the counter.
              </span>
            </p>
          ) : (
            <p className="text-ink-2">{style ? "Tap each size the team needs. Each tap adds a piece." : "Pick a style, then how many of each size."}</p>
          )}
          {carted.length > 0 && (
            <p className="tabular mt-1.5 text-[0.875rem] text-ink-2">
              Already in your cart: {runLabel(carted)}.
            </p>
          )}
        </div>

        <div className="mt-7 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={add}
            aria-busy={adding || undefined}
            aria-describedby="cart-note"
            className="press inline-flex h-14 items-center justify-center gap-2 rounded-full bg-action px-6 text-[1rem] font-semibold text-action-ink hover:bg-action-deep"
          >
            {adding ? <LoaderCircle aria-hidden="true" className="size-[1.125rem] animate-spin" /> : <ShoppingBag aria-hidden="true" className="size-[1.125rem]" />}
            {adding ? "Adding…" : pieces > 0 ? `Add ${piecesLabel(pieces)} to cart` : "Add to cart"}
          </button>
          <CartNote note={note} />
          <AskShop
            label="Ask the shop about this"
            detail={{ draft: `About ${label}${style ? `, ${style}` : ""}: ` }}
            className="mt-2 h-11 self-center rounded-full px-4 text-[0.9375rem] font-semibold text-ink-2 hover:bg-ground-2 hover:text-ink"
          />
        </div>

        {p.description && (
          <div className="mt-10 border-t border-line pt-6">
            <h2 className="text-[1rem] font-semibold text-ink">About this design</h2>
            <p className="mt-2 max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-2">{p.description}</p>
          </div>
        )}
        <dl className="mt-6 grid gap-x-6 gap-y-2 border-t border-line pt-6 text-[0.9375rem] sm:grid-cols-[8rem_minmax(0,1fr)]">
          <dt className="text-ink-2">Styles</dt>
          <dd className="text-ink">
            <ul>
              {p.colors.map((st) => (
                <li key={st} className="flex justify-between gap-4 sm:max-w-[20rem]">
                  <span>{st}</span>
                  <span className="tabular">{formatPeso(priceOf(st))}</span>
                </li>
              ))}
            </ul>
          </dd>
          <dt className="text-ink-2">Sizes</dt>
          <dd className="text-ink">{p.sizes.length > 1 ? `${p.sizes[0]} to ${p.sizes[p.sizes.length - 1]}` : p.sizes[0]}</dd>
          <dt className="text-ink-2">How to order</dt>
          <dd className="text-ink">
            Add the sizes to your cart and get a design ticket. At the counter you pay at least half down; the rest at pickup.
          </dd>
        </dl>
      </div>
    </div>
  );
}

/**
 * One size of the run. Empty, the whole tile is a button that adds a piece. Counted, it wears an
 * ink edge and a − count + stepper; the count can be typed (a team's 20 mediums).
 */
function SizeCounter({
  size,
  count,
  disabled,
  onAdd,
  onCount,
}: {
  size: string;
  count: number;
  disabled: boolean;
  onAdd: () => void;
  onCount: (n: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  if (count === 0) {
    return (
      <button type="button" onClick={onAdd} disabled={disabled} aria-label={`Size ${size}: add a piece`} className="shop-size press min-h-[4.5rem]">
        <span className="tabular text-[0.9375rem] font-semibold">{size}</span>
        {!disabled && (
          <span aria-hidden="true" className="shop-size-left">
            Tap to add
          </span>
        )}
      </button>
    );
  }
  const commit = () => {
    if (draft === null) return;
    const n = parseInt(draft, 10);
    setDraft(null);
    if (Number.isFinite(n) && n !== count) onCount(n);
  };
  return (
    <div role="group" aria-label={`Size ${size}`} className="design-count flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-[0.875rem] px-1 py-1.5">
      <span className="tabular text-[0.875rem] font-semibold leading-none text-ink">{size}</span>
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => onCount(count - 1)}
          aria-label={count === 1 ? `Take size ${size} out` : `One fewer ${size}`}
          className="press grid size-8 place-items-center rounded-full text-ink hover:bg-ground-2"
        >
          <Minus aria-hidden="true" className="size-3.5" />
        </button>
        <input
          inputMode="numeric"
          aria-label={`Pieces in size ${size}`}
          value={draft ?? String(count)}
          onFocus={(e) => {
            setDraft(String(count));
            e.currentTarget.select();
          }}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 2))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(null);
              e.currentTarget.blur();
            }
          }}
          className="tabular h-8 w-8 bg-transparent text-center text-[1.0625rem] font-semibold text-ink outline-none focus-visible:rounded-md focus-visible:shadow-[0_0_0_2px_var(--focus)]"
        />
        <button
          type="button"
          onClick={() => onCount(count + 1)}
          disabled={count >= MAX_PER_LINE}
          aria-label={`One more ${size}`}
          className="press grid size-8 place-items-center rounded-full text-ink hover:bg-ground-2 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Plus aria-hidden="true" className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
