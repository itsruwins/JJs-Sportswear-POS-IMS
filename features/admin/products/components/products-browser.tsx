"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search, Shirt, X } from "lucide-react";
import {
  priceRange,
  productStock,
  sizeSummaries,
  sortColors,
  unique,
  type CatalogProduct,
} from "@/features/shared/catalog/catalog";
import { Pill, ProductThumb, SizeRail } from "./product-parts";

export type Filter = "active" | "low" | "out" | "archived";
export type Sort = "name" | "attention" | "updated";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "active", label: "In catalog" },
  { id: "low", label: "Low stock" },
  { id: "out", label: "Sold-out sizes" },
  { id: "archived", label: "Archived" },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: "name", label: "Name, A to Z" },
  { id: "attention", label: "Needs restock first" },
  { id: "updated", label: "Recently updated" },
];

type Row = {
  product: CatalogProduct;
  stock: ReturnType<typeof productStock>;
  sizes: ReturnType<typeof sizeSummaries>;
  colors: string[];
  /** Name and tags, shared by every variant. */
  productText: string;
  variantKeys: { text: string; size: string }[];
};

/** Each word must match the product (name, tag) or one and the same variant (color, SKU, exact size). */
function matches(row: Row, tokens: string[]) {
  const onProduct = (t: string) => row.productText.includes(t);
  if (tokens.every(onProduct)) return true;
  return row.variantKeys.some((v) => tokens.every((t) => onProduct(t) || v.text.includes(t) || v.size === t));
}

function inFilter(row: Row, filter: Filter) {
  if (filter === "archived") return !row.product.is_active;
  if (!row.product.is_active) return false;
  if (filter === "low") return row.stock.low > 0;
  if (filter === "out") return row.stock.zero > 0;
  return true;
}

export function ProductsBrowser({
  products,
  initialQuery,
  initialFilter,
  initialSort,
  canEdit = true,
}: {
  products: CatalogProduct[];
  initialQuery: string;
  initialFilter: Filter;
  initialSort: Sort;
  /** Staff look up stock; only the owner adds products. */
  canEdit?: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [sort, setSort] = useState<Sort>(initialSort);

  const rows = useMemo<Row[]>(
    () =>
      products.map((product) => {
        const colors = sortColors(unique(product.variants.map((v) => v.color)));
        return {
          product,
          stock: productStock(product),
          sizes: sizeSummaries(product),
          colors,
          productText: [product.name, ...product.tags].join(" \u0000 ").toLowerCase(),
          variantKeys: product.variants.map((v) => ({
            text: `${v.color ?? ""} \u0000 ${v.sku ?? ""}`.toLowerCase(),
            size: (v.size ?? "").toLowerCase(),
          })),
        };
      }),
    [products],
  );

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, rows.filter((r) => inFilter(r, f.id)).length])) as Record<Filter, number>,
    [rows],
  );

  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visible = rows
    .filter((r) => inFilter(r, filter))
    .filter((r) => tokens.length === 0 || matches(r, tokens))
    .sort((a, b) => {
      if (sort === "attention") return b.stock.zero * 100 + b.stock.low - (a.stock.zero * 100 + a.stock.low) || a.product.name.localeCompare(b.product.name);
      if (sort === "updated") return b.product.updated_at.localeCompare(a.product.updated_at);
      return a.product.name.localeCompare(b.product.name);
    });

  // Keep the view in the URL so a refresh or a shared link lands on the same list.
  const syncUrl = (next: { q?: string; filter?: Filter; sort?: Sort }) => {
    const params = new URLSearchParams(window.location.search);
    const set = (key: string, value: string, fallback: string) =>
      value && value !== fallback ? params.set(key, value) : params.delete(key);
    if (next.q !== undefined) set("q", next.q.trim(), "");
    if (next.filter) set("filter", next.filter, "active");
    if (next.sort) set("sort", next.sort, "name");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  };

  if (products.length === 0) {
    return (
      <EmptyState
        title="No products yet"
        body={
          canEdit
            ? "Add your first product with the button above. It shows up here with its sizes, colors, and stock."
            : "Products show up here with their sizes, colors, and stock once the owner adds them."
        }
      />
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-[26rem]">
          <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-[1.125rem] -translate-y-1/2 text-ink-2" />
          <label htmlFor="product-search" className="sr-only">
            Search products
          </label>
          <input
            id="product-search"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              syncUrl({ q: e.target.value });
            }}
            placeholder="Name, SKU, tag, size, color"
            autoComplete="off"
            spellCheck={false}
            className="auth-input pl-11 pr-11"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                syncUrl({ q: "" });
              }}
              aria-label="Clear search"
              className="press absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-ink-2 hover:text-ink"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => {
              const on = filter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setFilter(f.id);
                    syncUrl({ filter: f.id });
                  }}
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
          <label className="flex items-center gap-2 text-[0.875rem] text-ink-2">
            Sort
            <select
              value={sort}
              onChange={(e) => {
                const next = e.target.value as Sort;
                setSort(next);
                syncUrl({ sort: next });
              }}
              className="h-9 rounded-full bg-ground-2 px-3 text-[0.875rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] outline-none focus-visible:shadow-[0_0_0_2px_var(--focus)]"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <p className="mt-5 text-[0.875rem] text-ink-2" aria-live="polite">
        {visible.length} {visible.length === 1 ? "product" : "products"}
        {tokens.length > 0 && <> matching “{query.trim()}”</>}
      </p>

      {visible.length === 0 ? (
        <EmptyState
          title={tokens.length ? `Nothing matches “${query.trim()}”` : "Nothing here"}
          body={
            tokens.length
              ? "Try a product name, a SKU like JRS-REV-BLK-M, a size like XL, or a color."
              : filter === "archived"
                ? "Archived products show up here. None are archived right now."
                : "No products are in this group right now."
          }
          action={
            tokens.length || filter !== "active" ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setFilter("active");
                  syncUrl({ q: "", filter: "active" });
                }}
                className="press mt-4 inline-flex h-10 items-center rounded-full px-4 text-[0.875rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2"
              >
                Show all products
              </button>
            ) : null
          }
        />
      ) : (
        <ul className="mt-3 border-t border-line">
          {visible.map(({ product, stock, sizes, colors }) => (
            <li key={product.id} className="border-b border-line">
              <Link
                href={`/admin/products/${product.id}`}
                className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 rounded-xl py-4 outline-offset-[-2px] md:grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1fr)_7rem_auto] md:gap-x-6"
              >
                <ProductThumb src={product.image} name={product.name} />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[1rem] font-semibold text-ink group-hover:underline">{product.name}</span>
                    {!product.is_active && <Pill>Archived</Pill>}
                    {product.made_to_order && <Pill>Made to order</Pill>}
                  </p>
                  <p className="mt-1 truncate text-[0.875rem] text-ink-2">
                    {product.made_to_order
                      ? `${colors.length} ${colors.length === 1 ? "style" : "styles"}`
                      : colors.join(" · ") || "No colors"}
                    <span className="md:hidden"> · {priceRange(product)}</span>
                  </p>
                </div>
                <div className="col-span-3 col-start-1 row-start-2 md:col-span-1 md:col-start-auto md:row-start-auto">
                  {product.made_to_order && sizes.length > 0 ? (
                    // No stock to show: just the size range it's made in.
                    <span className="tabular text-[0.875rem] text-ink">
                      {sizes.length > 1 ? `${sizes[0].size}–${sizes[sizes.length - 1].size}` : sizes[0].size}
                      <span className="text-ink-2"> · {sizes.length} {sizes.length === 1 ? "size" : "sizes"}</span>
                    </span>
                  ) : sizes.length > 0 ? (
                    <SizeRail sizes={sizes} compact />
                  ) : (
                    <span className="text-[0.875rem] text-ink-2">No sizes yet</span>
                  )}
                </div>
                <div className="hidden text-right md:block">
                  <p className="tabular text-[0.9375rem] font-semibold text-ink">{priceRange(product)}</p>
                  <p className="tabular mt-0.5 text-[0.8125rem] text-ink-2">
                    {product.made_to_order ? "No stock kept" : `${stock.total} in stock`}
                  </p>
                </div>
                <ChevronRight
                  aria-hidden="true"
                  className="col-start-3 row-start-1 size-5 text-ink-2 transition-transform duration-150 group-hover:translate-x-0.5 md:col-start-auto md:row-start-auto"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[0.8125rem] text-ink-2" aria-label="Legend">
        <li className="inline-flex items-center gap-2">
          <span className="cell size-3.5 rounded-[4px]" aria-hidden="true" />
          In stock
        </li>
        <li className="inline-flex items-center gap-2">
          <span data-stock="low" className="cell size-3.5 rounded-[4px]" aria-hidden="true" />
          A color is low or sold out
        </li>
        <li className="inline-flex items-center gap-2">
          <span data-stock="low" data-partial="true" className="cell size-4 rounded-[4px]" aria-hidden="true" />
          Dot: one color is sold out
        </li>
        <li className="inline-flex items-center gap-2">
          <span data-stock="zero" className="cell size-3.5 rounded-[4px]" aria-hidden="true" />
          Sold out in every color
        </li>
      </ul>
    </div>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-10">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ground-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]">
        <Shirt aria-hidden="true" className="size-6" strokeWidth={1.7} />
      </span>
      <div>
        <p className="text-[1.0625rem] font-semibold text-ink">{title}</p>
        <p className="mt-1 max-w-[52ch] text-[0.9375rem] leading-relaxed text-ink-2">{body}</p>
        {action}
      </div>
    </div>
  );
}
