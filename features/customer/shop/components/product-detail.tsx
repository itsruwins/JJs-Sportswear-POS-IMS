"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { LoaderCircle, ShoppingBag } from "lucide-react";
import { formatPeso } from "@/features/shared/catalog/catalog";
import { garmentColor } from "@/features/shared/catalog/colors";
import type { ShopProduct } from "@/features/customer/shop/model";
import { AskShop } from "@/features/customer/chat/components/ask-shop";
import { addToCart } from "@/features/customer/cart/actions";
import { CartNote, type AddNote } from "@/features/customer/cart/components/cart-note";
import { GarmentArt } from "./garment-art";

function piecesLeft(n: number) {
  return n === 1 ? "1 left" : `${n} left`;
}

/**
 * The product page's working half: the garment, color swatches, a size grid with the
 * pieces left in the chosen color, and the two ways forward (add it to the cart to buy at
 * the shop, or have a custom version made). Picking a color recolors the garment and
 * updates every count.
 */
export function ProductDetail({
  product: p,
  category,
  inCart,
}: {
  product: ShopProduct;
  category: string | null;
  /** Pieces already in the customer's cart, per variant id. */
  inCart: Record<string, number>;
}) {
  const firstInStock = p.colors.find((c) => p.variants.some((v) => v.color === c && v.stock > 0)) ?? p.colors[0] ?? null;
  const [color, setColor] = useState<string | null>(firstInStock);
  const [size, setSize] = useState<string | null>(p.sizes.length === 1 ? p.sizes[0] : null);
  const [needSize, setNeedSize] = useState(false);
  const sizeGroup = useRef<HTMLFieldSetElement>(null);
  const [adding, startAdding] = useTransition();
  const [note, setNote] = useState<AddNote | null>(null);

  const forColor = p.variants.filter((v) => v.color === color);
  const variantOf = (s: string) => forColor.find((v) => v.size === s) ?? null;
  const chosen = size ? variantOf(size) : null;
  const colorStock = forColor.reduce((sum, v) => sum + v.stock, 0);
  const prices = forColor.map((v) => v.price);
  const price = chosen
    ? formatPeso(chosen.price)
    : prices.length && Math.min(...prices) !== Math.max(...prices)
      ? `${formatPeso(Math.min(...prices))}–${formatPeso(Math.max(...prices))}`
      : formatPeso(prices[0] ?? p.priceMin);

  const pickColor = (c: string) => {
    setColor(c);
    // Keep the size if it's still in stock in the new color.
    if (size && !p.variants.some((v) => v.color === c && v.size === size && v.stock > 0) && p.sizes.length > 1) setSize(null);
  };

  const chosenInCart = chosen ? (inCart[chosen.id] ?? 0) : 0;

  const add = () => {
    if (adding) return;
    if (!chosen) {
      setNeedSize(true);
      sizeGroup.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
      return;
    }
    const label = `${chosen.size} · ${chosen.color}`;
    const before = chosenInCart;
    if (before >= chosen.stock) {
      setNote({ kind: "problem", text: `All ${chosen.stock} in ${label} are already in your cart.` });
      return;
    }
    startAdding(async () => {
      const r = await addToCart(chosen.id, 1);
      if (!r.ok) setNote({ kind: "problem", text: r.message });
      else if (r.quantity <= before) setNote({ kind: "problem", text: `All ${r.quantity} in ${label} are already in your cart.` });
      else setNote({ kind: "added", label, quantity: r.quantity });
    });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-14">
      {/* Sticky on a plain wrapper: the tile's own positioning would turn `top` into an offset. */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="shop-tile aspect-square">
          <GarmentArt image={p.image} color={color} name={p.name} className="shop-detail-art" sizes="(min-width: 1024px) 55vw, 100vw" />
        </div>
      </div>

      <div className="min-w-0">
        <h1 className="voice-display text-[clamp(2.25rem,4.5vw,3.5rem)]">{p.name}</h1>
        {category && <p className="mt-2 text-[1rem] text-ink-2">{category}</p>}
        <p className="tabular mt-4 text-[1.25rem] font-semibold text-ink">{price}</p>

        {/* Color */}
        {p.colors.length > 0 && (
          <fieldset className="mt-8">
            <legend className="text-[0.9375rem] text-ink-2">
              Color: <span className="font-semibold text-ink">{color}</span>
            </legend>
            <div className="mt-3 flex flex-wrap gap-2.5">
              {p.colors.map((c) => {
                const hex = garmentColor(c).body;
                const out = !p.variants.some((v) => v.color === c && v.stock > 0);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={c === color}
                    aria-label={`${c}${out ? ", sold out" : ""}`}
                    title={c}
                    onClick={() => pickColor(c)}
                    className="shop-swatch press"
                    data-out={out ? "true" : undefined}
                    style={{ "--swatch": hex } as React.CSSProperties}
                  />
                );
              })}
            </div>
          </fieldset>
        )}

        {/* Size */}
        <fieldset ref={sizeGroup} className="mt-8" aria-describedby={needSize && !chosen ? "size-needed" : undefined}>
          <legend className="flex w-full items-baseline justify-between gap-3 text-[0.9375rem]">
            <span className="font-semibold text-ink">Size</span>
            <span className="text-[0.875rem] text-ink-2">Pieces left at the shop</span>
          </legend>
          <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-2">
            {p.sizes.map((s) => {
              const v = variantOf(s);
              const stock = v?.stock ?? 0;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={s === size}
                  disabled={stock <= 0}
                  onClick={() => {
                    setSize(s);
                    setNeedSize(false);
                  }}
                  className="shop-size press"
                  data-low={v?.low ? "true" : undefined}
                >
                  <span className="tabular text-[0.9375rem] font-semibold">{s}</span>
                  <span className="shop-size-left tabular">
                    {!v ? "Not in this color" : stock <= 0 ? "Sold out" : piecesLeft(stock)}
                  </span>
                </button>
              );
            })}
          </div>
          {needSize && !chosen && (
            <p id="size-needed" role="alert" className="mt-3 text-[0.9375rem] font-semibold text-ink">
              Pick a size first, so you know it’s on the rack.
            </p>
          )}
        </fieldset>

        <p className="mt-4 flex items-center gap-2 text-[0.9375rem] text-ink-2" aria-live="polite">
          {chosen ? (
            <>
              {chosen.low && <span aria-hidden="true" className="size-2 shrink-0 rounded-full signal-dot" />}
              <span>
                <span className="font-semibold text-ink">
                  {chosen.low ? `Only ${piecesLeft(chosen.stock)}` : piecesLeft(chosen.stock)}
                </span>{" "}
                in {chosen.size} · {chosen.color}, as of now.
                {chosenInCart > 0 && <span className="tabular"> {chosenInCart} in your cart.</span>}
              </span>
            </>
          ) : colorStock > 0 ? (
            <span>
              <span className="tabular font-semibold text-ink">{colorStock}</span> pieces in {color} across all sizes.
            </span>
          ) : (
            <span className="font-semibold text-ink">{color} is sold out in every size.</span>
          )}
        </p>

        <div className="mt-7 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={add}
            disabled={p.stock <= 0}
            aria-busy={adding || undefined}
            aria-describedby="cart-note"
            className="press inline-flex h-14 items-center justify-center gap-2 rounded-full bg-action px-6 text-[1rem] font-semibold text-action-ink hover:bg-action-deep disabled:bg-ground-2 disabled:text-ink-2 disabled:shadow-[inset_0_0_0_1px_var(--line)]"
          >
            {adding ? (
              <LoaderCircle aria-hidden="true" className="size-[1.125rem] animate-spin" />
            ) : (
              <ShoppingBag aria-hidden="true" className="size-[1.125rem]" />
            )}
            {p.stock <= 0 ? "Sold out at the shop" : adding ? "Adding…" : "Add to cart"}
          </button>
          <CartNote note={note} />
          <Link
            href={`/orders/new?product=${p.id}${color ? `&color=${encodeURIComponent(color)}` : ""}`}
            className="press inline-flex h-14 items-center justify-center rounded-full px-6 text-[1rem] font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--ink)] hover:bg-ground-2"
          >
            Make a custom version
          </Link>
          <p className="text-center text-[0.8125rem] text-ink-2">Your own colors, names, and numbers. The shop prices it after you send it.</p>
          <AskShop
            label="Ask the shop about this"
            detail={{ draft: `About the ${p.name}${color ? ` in ${color}` : ""}: ` }}
            className="mt-2 h-11 self-center rounded-full px-4 text-[0.9375rem] font-semibold text-ink-2 hover:bg-ground-2 hover:text-ink"
          />
        </div>

        {p.description && (
          <div className="mt-10 border-t border-line pt-6">
            <h2 className="text-[1rem] font-semibold text-ink">About this item</h2>
            <p className="mt-2 max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-2">{p.description}</p>
          </div>
        )}
        <dl className="mt-6 grid gap-x-6 gap-y-2 border-t border-line pt-6 text-[0.9375rem] sm:grid-cols-[8rem_minmax(0,1fr)]">
          <dt className="text-ink-2">Sizes</dt>
          <dd className="text-ink">{p.sizes.join(", ")}</dd>
          <dt className="text-ink-2">Colors</dt>
          <dd className="text-ink">{p.colors.join(", ")}</dd>
          <dt className="text-ink-2">How to buy</dt>
          <dd className="text-ink">Add it to your cart, then pay at the shop counter: cash or e-payment</dd>
        </dl>
      </div>
    </div>
  );
}
