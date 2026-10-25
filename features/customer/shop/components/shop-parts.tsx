import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatPeso } from "@/features/shared/catalog/catalog";
import { CATEGORIES, inCategory, leadColor, type ShopProduct } from "@/features/customer/shop/model";
import { GarmentArt } from "./garment-art";

export function priceLabel(p: Pick<ShopProduct, "priceMin" | "priceMax">) {
  return p.priceMin === p.priceMax ? formatPeso(p.priceMin) : `From ${formatPeso(p.priceMin)}`;
}

/** "Basketball · 4 colors": the product's first category and how many colors it comes in. */
function subtitle(p: ShopProduct) {
  const cat = CATEGORIES.find((c) => inCategory(p, c));
  const colors = p.colors.length > 1 ? `${p.colors.length} colors` : p.colors[0] ?? null;
  return [cat?.label, colors].filter(Boolean).join(" · ");
}

export function ProductCard({ product: p }: { product: ShopProduct }) {
  const soldOut = p.stock <= 0;
  return (
    <Link href={`/shop/${p.id}`} className="shop-card group block rounded-[1.125rem]">
      <div className="shop-tile aspect-[4/5]">
        <GarmentArt
          image={p.image}
          color={leadColor(p)}
          name={p.name}
          className={`shop-tile-art ${soldOut ? "opacity-55" : ""}`}
        />
      </div>
      <div className="px-0.5 pb-1 pt-3">
        <p className="text-[0.9375rem] font-semibold leading-snug text-ink">{p.name}</p>
        <p className="mt-0.5 text-[0.875rem] leading-snug text-ink-2">{subtitle(p)}</p>
        <p className="tabular mt-1.5 text-[0.9375rem] font-semibold text-ink">
          {soldOut ? <span className="font-medium text-ink-2">Sold out</span> : priceLabel(p)}
        </p>
      </div>
    </Link>
  );
}

/** The first thing in the shop: one product, large, on the backdrop. */
export function FeaturedBand({ product: p }: { product: ShopProduct }) {
  return (
    <section aria-labelledby="featured-title" className="shop-tile shop-featured grid overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="order-2 flex flex-col items-start justify-end gap-4 px-6 pb-7 pt-2 sm:px-9 sm:pb-9 md:order-1 md:py-12 lg:px-12">
        {/* The backdrop stays light in both themes, so its text uses card ink, never the theme's ink. */}
        <h2 id="featured-title" className="voice-display text-[clamp(2.25rem,5.5vw,4.25rem)] text-card-ink">
          {p.name}
        </h2>
        {p.description && <p className="max-w-[38ch] text-[1rem] leading-relaxed text-card-ink/70">{p.description}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link
            href={`/shop/${p.id}`}
            className="press inline-flex h-12 items-center gap-2 rounded-full bg-card-ink px-6 text-[0.9375rem] font-semibold text-card hover:opacity-90"
          >
            View product
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
          <span className="tabular text-[1rem] font-semibold text-card-ink">{priceLabel(p)}</span>
        </div>
      </div>
      <div className="order-1 aspect-[5/4] md:order-2 md:aspect-auto md:min-h-[26rem]">
        <GarmentArt image={p.image} color={leadColor(p)} name={p.name} className="shop-featured-art" sizes="(min-width: 768px) 55vw, 100vw" />
      </div>
    </section>
  );
}

export type CategoryTile = { id: string; label: string; count: number; cover: ShopProduct | null };

/** "Shop by sport and type": a row of tiles, each opening the grid filtered to it. */
export function CategoryRail({ categories, current }: { categories: CategoryTile[]; current: string }) {
  return (
    <section aria-labelledby="sports-title" className="mt-12 sm:mt-14">
      <h2 id="sports-title" className="voice-display mb-5 text-[clamp(1.75rem,3vw,2.25rem)]">
        Shop by sport and type
      </h2>
      <ul className="shop-rail -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:auto-cols-fr lg:grid-flow-col lg:overflow-visible lg:px-0 lg:pb-0">
        {categories.map((c) => (
          <li key={c.id} className="w-[9.5rem] shrink-0 snap-start sm:w-[10.5rem] lg:w-auto">
            <Link
              href={c.id === current ? "/shop#products" : `/shop?cat=${c.id}#products`}
              aria-current={c.id === current ? "true" : undefined}
              className="shop-card group block rounded-[1.125rem]"
            >
              <div className="shop-tile aspect-square" data-current={c.id === current ? "true" : undefined}>
                {c.cover && (
                  <GarmentArt image={c.cover.image} color={leadColor(c.cover)} name={c.cover.name} className="shop-tile-art" sizes="12rem" />
                )}
              </div>
              <p className="mt-2.5 flex items-baseline justify-between gap-2 px-0.5">
                <span className="text-[0.9375rem] font-semibold text-ink">{c.label}</span>
                <span className="tabular text-[0.8125rem] text-ink-2">{c.count}</span>
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
