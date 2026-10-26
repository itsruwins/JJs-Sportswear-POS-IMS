"use client";

import { useRef, useState } from "react";
import { Store, X } from "lucide-react";
import { formatPeso } from "@/features/shared/catalog/catalog";
import type { ShopProduct } from "@/features/customer/shop/model";
import { AskShop } from "@/features/customer/chat/components/ask-shop";
import { GarmentArt } from "./garment-art";
import type { ShopInfo } from "./product-detail";

/**
 * A made-to-order design's page: its photos, the four styles with their prices, the sizes it's
 * made in, and how to order it (at the shop counter, at least half down). Nothing is ordered here;
 * the sheet is something to show at the counter.
 */
export function DesignDetail({ product: p, shop }: { product: ShopProduct; shop: ShopInfo }) {
  const photos = p.images.length ? p.images : p.image ? [p.image] : [];
  const [photo, setPhoto] = useState(0);
  const [style, setStyle] = useState<string | null>(p.colors.length === 1 ? p.colors[0] : null);
  const [size, setSize] = useState<string | null>(null);
  const [need, setNeed] = useState(false);
  const styleGroup = useRef<HTMLFieldSetElement>(null);
  const sizeGroup = useRef<HTMLFieldSetElement>(null);
  const sheet = useRef<HTMLDialogElement>(null);

  const priceOf = (st: string) => {
    const prices = p.variants.filter((v) => v.color === st).map((v) => v.price);
    return prices.length ? Math.min(...prices) : p.priceMin;
  };
  const chosen = style && size ? (p.variants.find((v) => v.color === style && v.size === size) ?? null) : null;
  const sizesFor = (st: string | null) => (st ? p.sizes.filter((s) => p.variants.some((v) => v.color === st && v.size === s)) : p.sizes);
  const price = chosen ? formatPeso(chosen.price) : style ? formatPeso(priceOf(style)) : `From ${formatPeso(p.priceMin)}`;
  const label = p.designNumber !== null ? `design ${p.designNumber} (${p.name})` : p.name;

  const order = () => {
    if (!chosen) {
      setNeed(true);
      (style ? sizeGroup : styleGroup).current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
      return;
    }
    sheet.current?.showModal();
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
        <p className="tabular mt-4 text-[1.25rem] font-semibold text-ink">{price}</p>

        {/* Style */}
        <fieldset ref={styleGroup} className="mt-8">
          <legend className="text-[0.9375rem] text-ink-2">
            Style{style && <>: <span className="font-semibold text-ink">{style}</span></>}
          </legend>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {p.colors.map((st) => (
              <button
                key={st}
                type="button"
                aria-pressed={st === style}
                onClick={() => {
                  setStyle(st);
                  if (size && !sizesFor(st).includes(size)) setSize(null);
                }}
                className="shop-size press min-h-[4.25rem] px-3"
              >
                <span className="text-[0.9375rem] font-semibold">{st}</span>
                <span className="shop-size-left tabular">{formatPeso(priceOf(st))} each</span>
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-[0.875rem] leading-relaxed text-ink-2">
            A set is the jersey and shorts; upper is the jersey alone. NBA cut has deeper armholes and narrower shoulders.
          </p>
        </fieldset>

        {/* Size */}
        <fieldset ref={sizeGroup} className="mt-8" aria-describedby={need && !chosen ? "design-need" : undefined}>
          <legend className="flex w-full items-baseline justify-between gap-3 text-[0.9375rem]">
            <span className="font-semibold text-ink">Size</span>
            <span className="text-[0.875rem] text-ink-2">Every size is made to order</span>
          </legend>
          <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2">
            {p.sizes.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={s === size}
                disabled={!sizesFor(style).includes(s)}
                onClick={() => {
                  setSize(s);
                  setNeed(false);
                }}
                className="shop-size press min-h-[3.25rem]"
              >
                <span className="tabular text-[0.9375rem] font-semibold">{s}</span>
              </button>
            ))}
          </div>
          {need && !chosen && (
            <p id="design-need" role="alert" className="mt-3 text-[0.9375rem] font-semibold text-ink">
              {style ? "Pick a size first, so the counter knows what you want." : "Pick a style and a size first, so the counter knows what you want."}
            </p>
          )}
        </fieldset>

        <p className="mt-4 text-[0.9375rem] text-ink-2" aria-live="polite">
          {chosen ? (
            <>
              <span className="font-semibold text-ink">
                {chosen.color}, size {chosen.size}
              </span>{" "}
              · <span className="tabular">{formatPeso(chosen.price)}</span> a piece. Order as many as the team needs at the counter.
            </>
          ) : (
            "Printed and sewn for your team after you order at the shop."
          )}
        </p>

        <div className="mt-7 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={order}
            className="press inline-flex h-14 items-center justify-center gap-2 rounded-full bg-board px-6 text-[1rem] font-semibold text-board-ink hover:bg-board-deep"
          >
            <Store aria-hidden="true" className="size-[1.125rem]" />
            Order at the shop
          </button>
          <AskShop
            label="Ask the shop about this"
            detail={{ draft: `About ${label}${chosen ? `, ${chosen.color} in ${chosen.size}` : ""}: ` }}
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
          <dd className="text-ink">At the shop counter. At least half down when you order, the rest at pickup.</dd>
        </dl>
      </div>

      <OrderSheet sheetRef={sheet} product={p} variant={chosen} photo={photos[0] ?? null} shop={shop} />
    </div>
  );
}

function OrderSheet({
  sheetRef,
  product: p,
  variant,
  photo,
  shop,
}: {
  sheetRef: React.RefObject<HTMLDialogElement | null>;
  product: ShopProduct;
  variant: ShopProduct["variants"][number] | null;
  photo: string | null;
  shop: ShopInfo;
}) {
  const close = () => sheetRef.current?.close();
  const placeholders = !shop.address || !shop.hours || !shop.phone;
  const row = "grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 py-3";

  return (
    <dialog
      ref={sheetRef}
      className="auth-dialog"
      aria-labelledby="order-sheet-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="auth-sheet px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-7 sm:pb-7">
        <div className="flex items-start justify-between gap-4">
          <h2 id="order-sheet-title" className="voice-display text-[1.875rem]">
            Order it at the shop
          </h2>
          <button type="button" onClick={close} className="press -mr-2 -mt-1 grid size-10 place-items-center rounded-full text-ink-2 hover:bg-ground-2 hover:text-ink">
            <X aria-hidden="true" className="size-5" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        {variant && (
          <div className="mt-5 flex items-center gap-4 rounded-2xl bg-ground-2 p-3 shadow-[inset_0_0_0_1px_var(--line)]">
            <div className="shop-tile size-20 shrink-0 rounded-xl">
              <GarmentArt image={photo} color={null} name={p.name} className="shop-thumb-art" sizes="5rem" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[0.9375rem] font-semibold text-ink">{p.name}</p>
              <p className="text-[0.875rem] text-ink-2">
                {p.designNumber !== null && <>Design {p.designNumber} · </>}
                {variant.color} · Size {variant.size}
              </p>
              <p className="tabular mt-1 text-[0.9375rem] font-semibold text-ink">{formatPeso(variant.price)} a piece</p>
            </div>
          </div>
        )}

        <p className="mt-5 text-[0.9375rem] leading-relaxed text-ink-2">
          Show this at the counter. Staff take the team’s sizes, names, and numbers there, with at least half down. The rest is paid at
          pickup.
        </p>

        <dl className="mt-5 divide-y divide-line border-y border-line text-[0.9375rem]">
          <div className={row}>
            <dt className="text-ink-2">Where</dt>
            <dd className="text-ink">
              {shop.name}
              <br />
              {shop.address ?? <span className="text-ink-2">Street address to follow</span>}, {shop.city}
            </dd>
          </div>
          <div className={row}>
            <dt className="text-ink-2">Hours</dt>
            <dd className={shop.hours ? "text-ink" : "text-ink-2"}>{shop.hours ?? "Store hours to follow"}</dd>
          </div>
          <div className={row}>
            <dt className="text-ink-2">Phone</dt>
            <dd className={shop.phone ? "text-ink" : "text-ink-2"}>{shop.phone ?? "Contact number to follow"}</dd>
          </div>
          <div className={row}>
            <dt className="text-ink-2">Pay with</dt>
            <dd className="text-ink">Cash or e-payment at the counter</dd>
          </div>
        </dl>
        {placeholders && (
          <p className="mt-4 text-[0.8125rem] text-ink-2">The shop’s address, hours, and phone go here once they’re confirmed.</p>
        )}

        <button
          type="button"
          onClick={close}
          className="press mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-ink px-5 text-[1rem] font-semibold text-ground hover:opacity-90"
        >
          Got it
        </button>
      </div>
    </dialog>
  );
}
