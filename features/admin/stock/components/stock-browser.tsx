"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, PackagePlus, Search, Shirt, X } from "lucide-react";
import { priceRange, productStock, sizeSummaries, sortSizes, unique, type CatalogProduct } from "@/features/shared/catalog/catalog";
import { ProductThumb, SizeRail } from "@/features/admin/products/components/product-parts";
import { AdjustSheet } from "./adjust-sheet";

type Filter = "all" | "low" | "out";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "low", label: "Needs restock" },
  { id: "out", label: "Sold-out sizes" },
];

const searchText = (product: CatalogProduct) =>
  [product.name, ...product.tags, ...product.variants.flatMap((v) => [v.sku ?? "", v.color ?? ""])].join(" \u0000 ").toLowerCase();

/**
 * Find a product and change its stock. Archived products are left out; restore them first.
 * Made-to-order products keep no stock, so they're listed on their own with nothing to adjust.
 */
export function StockBrowser({ products }: { products: CatalogProduct[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [adjusting, setAdjusting] = useState<{ productId: string; focusId?: string } | null>(null);
  const [showMade, setShowMade] = useState(false);

  const madeToOrder = useMemo(
    () =>
      products
        .filter((p) => p.is_active && p.made_to_order)
        .map((product) => ({ product, text: searchText(product) }))
        .sort((a, b) => a.product.name.localeCompare(b.product.name)),
    [products],
  );

  const rows = useMemo(
    () =>
      products
        .filter((p) => p.is_active && !p.made_to_order)
        .map((product) => ({
          product,
          stock: productStock(product),
          sizes: sizeSummaries(product),
          text: searchText(product),
        })),
    [products],
  );

  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visible = rows
    .filter((r) => (filter === "low" ? r.stock.low + r.stock.zero > 0 : filter === "out" ? r.stock.zero > 0 : true))
    .filter((r) => tokens.every((t) => r.text.includes(t)))
    .sort((a, b) => a.product.name.localeCompare(b.product.name));
  const counts: Record<Filter, number> = {
    all: rows.length,
    low: rows.filter((r) => r.stock.low + r.stock.zero > 0).length,
    out: rows.filter((r) => r.stock.zero > 0).length,
  };
  // Look the product up fresh each render, so the sheet shows counts updated after a save.
  const current = adjusting ? (products.find((p) => p.id === adjusting.productId && !p.made_to_order) ?? null) : null;
  const madeMatches = madeToOrder.filter((r) => tokens.every((t) => r.text.includes(t)));
  // Only "All" lists them: they're never low or sold out. A search opens the group to show what it found.
  const madeShown = filter === "all" && madeMatches.length > 0;
  const madeOpen = showMade || tokens.length > 0;
  // An empty stocked list explains itself, unless the made-to-order group below already answers.
  const onlyMadeToOrder = rows.length === 0 && filter === "all" && tokens.length === 0;
  const saySomething = !onlyMadeToOrder && !(madeShown && tokens.length > 0);

  if (rows.length === 0 && madeToOrder.length === 0) {
    return (
      <div className="flex items-start gap-4 py-10">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ground-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]">
          <Shirt aria-hidden="true" className="size-6" strokeWidth={1.7} />
        </span>
        <div>
          <p className="text-[1.0625rem] font-semibold text-ink">No products to stock yet</p>
          <p className="mt-1 max-w-[52ch] text-[0.9375rem] leading-relaxed text-ink-2">
            Add a product first, then its sizes and colors show up here to restock and count.
          </p>
          <Link
            href="/admin/products/new"
            className="press mt-4 inline-flex h-10 items-center rounded-full px-4 text-[0.875rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2"
          >
            Add a product
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-[26rem]">
          <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-[1.125rem] -translate-y-1/2 text-ink-2" />
          <label htmlFor="stock-search" className="sr-only">
            Find a product
          </label>
          <input
            id="stock-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a product, SKU, or color"
            autoComplete="off"
            spellCheck={false}
            className="auth-input pl-11 pr-11"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="press absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-ink-2 hover:text-ink"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>
        <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const on = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(f.id)}
                className={`press inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[0.875rem] font-semibold ${
                  on ? "bg-ink text-ground" : "text-ink-2 shadow-[inset_0_0_0_1px_var(--line)] hover:text-ink"
                }`}
              >
                {f.label}
                <span className={`tabular text-[0.8125rem] ${on ? "opacity-75" : ""}`}>{counts[f.id]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        saySomething && (
          <p className="py-10 text-[0.9375rem] text-ink-2">
            {tokens.length ? `Nothing matches “${query.trim()}”.` : "Nothing needs attention here right now."}
          </p>
        )
      ) : (
        <ul className="mt-5 border-t border-line">
          {visible.map(({ product, stock, sizes }) => (
            <li
              key={product.id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 border-b border-line py-4 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.2fr)_auto] md:gap-x-6"
            >
              <ProductThumb src={product.image} name={product.name} />
              <div className="min-w-0">
                <Link href={`/admin/products/${product.id}`} className="text-[1rem] font-semibold text-ink hover:underline">
                  {product.name}
                </Link>
                <p className="tabular mt-1 text-[0.875rem] text-ink-2">{stock.total} in stock</p>
              </div>
              <div className="col-span-3 row-start-2 md:col-span-1 md:row-start-auto">
                {sizes.length ? (
                  <SizeRail
                    sizes={sizes}
                    compact
                    onSelect={(size) => {
                      // Land on that size's first color (colors in alphabetical order, as the sheet shows them).
                      const first = product.variants
                        .filter((v) => v.is_active && (v.size ?? "One size") === size)
                        .sort((a, b) => (a.color ?? "").localeCompare(b.color ?? ""))[0];
                      setAdjusting({ productId: product.id, focusId: first?.id });
                    }}
                  />
                ) : (
                  <span className="text-[0.875rem] text-ink-2">No sizes yet</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setAdjusting({ productId: product.id })}
                aria-haspopup="dialog"
                className="press col-start-3 row-start-1 inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-[0.875rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2 md:col-start-auto md:row-start-auto"
              >
                <PackagePlus aria-hidden="true" className="size-4" />
                Adjust
                <span className="sr-only"> stock for {product.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {madeShown && (
        <section aria-labelledby="made-title" className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line pb-3">
            <div>
              <h2 id="made-title" className="voice-display text-[1.5rem]">
                Made to order
              </h2>
              <p className="mt-1 max-w-[52ch] text-[0.875rem] text-ink-2">
                Printed after they’re ordered, so there’s no stock to count or restock.
              </p>
            </div>
            {!tokens.length && (
              <button
                type="button"
                aria-expanded={madeOpen}
                aria-controls="made-list"
                onClick={() => setShowMade((v) => !v)}
                className="press inline-flex h-10 items-center gap-2 rounded-full px-3.5 text-[0.875rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2"
              >
                {madeOpen ? "Hide" : "Show"} {madeMatches.length}
                <ChevronDown aria-hidden="true" className={`size-4 transition-transform duration-200 ${madeOpen ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>
          {madeOpen && (
            <ul id="made-list">
              {madeMatches.map(({ product }) => {
                const live = product.variants.filter((v) => v.is_active);
                const sizes = sortSizes(unique(live.map((v) => v.size)));
                const styles = unique(live.map((v) => v.color)).length;
                return (
                  <li
                    key={product.id}
                    className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 border-b border-line py-3.5 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] md:gap-x-6"
                  >
                    <ProductThumb src={product.image} name={product.name} />
                    <div className="min-w-0">
                      <Link href={`/admin/products/${product.id}`} className="text-[1rem] font-semibold text-ink hover:underline">
                        {product.name}
                      </Link>
                      <p className="mt-1 text-[0.875rem] text-ink-2 md:hidden">
                        {styles} {styles === 1 ? "style" : "styles"} · {sizes.length > 1 ? `${sizes[0]}–${sizes[sizes.length - 1]}` : (sizes[0] ?? "No sizes")}
                      </p>
                    </div>
                    <p className="hidden text-[0.875rem] text-ink-2 md:block">
                      {styles} {styles === 1 ? "style" : "styles"} ·{" "}
                      <span className="tabular text-ink">{sizes.length > 1 ? `${sizes[0]}–${sizes[sizes.length - 1]}` : (sizes[0] ?? "No sizes")}</span>
                    </p>
                    <p className="tabular hidden text-right text-[0.9375rem] font-semibold text-ink md:block">{priceRange(product)}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <AdjustSheet product={current} open={!!current} focusVariantId={adjusting?.focusId} onClose={() => setAdjusting(null)} />
    </div>
  );
}
