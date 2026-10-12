"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Search, X } from "lucide-react";
import { SORTS, type ShopQuery } from "@/lib/customer/catalog";

type Chip = { id: string; label: string };

/**
 * Search, sport chips, size, in-stock, and sort above the grid. Every choice lives in the
 * URL, so a filtered shop can be shared and the back button undoes it. The grid dims while
 * the server sends the new list.
 */
export function ShopControls({
  query,
  chips,
  sizes,
  count,
  children,
}: {
  query: ShopQuery;
  chips: Chip[];
  sizes: string[];
  count: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(query.q);
  const timer = useRef<number | undefined>(undefined);

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    startTransition(() => router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false }));
  };

  // A fresh query from outside (a category tile, the back button) resets the field.
  const [seenQ, setSeenQ] = useState(query.q);
  if (query.q !== seenQ) {
    setSeenQ(query.q);
    setSearch(query.q);
  }

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onSearch = (value: string) => {
    setSearch(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => set({ q: value.trim() || null }), 280);
  };

  const filtered = Boolean(query.q || query.cat || query.size || query.inStock);

  return (
    <div>
      <div className="flex flex-col gap-4">
        <label className="shop-search">
          <Search aria-hidden="true" className="size-[1.125rem] shrink-0 text-ink-2" />
          <span className="sr-only">Search products</span>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search jerseys, shorts, caps…"
            autoComplete="off"
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-[1rem] text-ink outline-none placeholder:text-ink-2"
          />
          {search && (
            <button type="button" onClick={() => onSearch("")} className="press -mr-1 grid size-8 place-items-center rounded-full text-ink-2 hover:bg-ground hover:text-ink">
              <X aria-hidden="true" className="size-4" />
              <span className="sr-only">Clear search</span>
            </button>
          )}
        </label>

        <div role="group" aria-label="Sport or type" className="shop-chips -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:px-0">
          {[{ id: "", label: "All" }, ...chips].map((c) => (
            <button
              key={c.id || "all"}
              type="button"
              aria-pressed={query.cat === c.id}
              onClick={() => set({ cat: c.id || null })}
              className="shop-chip press"
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="shop-select">
            <span className="sr-only">Size in stock</span>
            <select value={query.size} onChange={(e) => set({ size: e.target.value || null })}>
              <option value="">Any size</option>
              {sizes.map((s) => (
                <option key={s} value={s}>
                  Size {s}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" className="size-4 text-ink-2" />
          </label>

          <button
            type="button"
            aria-pressed={query.inStock}
            onClick={() => set({ stock: query.inStock ? null : "1" })}
            className="shop-toggle press"
          >
            <span aria-hidden="true" className="shop-toggle-track">
              <span className="shop-toggle-thumb" />
            </span>
            In stock only
          </button>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-b border-line pb-3">
        <p className="min-w-0 text-[0.875rem] text-ink-2" aria-live="polite">
          <span className="tabular font-semibold text-ink">{count}</span> {count === 1 ? "product" : "products"}
          {query.size && ` with size ${query.size} in stock`}
          {filtered && (
            <>
              {" · "}
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  set({ q: null, cat: null, size: null, stock: null });
                }}
                className="press font-semibold text-ink underline underline-offset-4 hover:no-underline"
              >
                Clear filters
              </button>
            </>
          )}
        </p>
        <label className="shop-select shrink-0">
          <span className="sr-only">Sort by</span>
          <select value={query.sort} onChange={(e) => set({ sort: e.target.value === "featured" ? null : e.target.value })}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id === "featured" ? "Sort: Featured" : s.label}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" className="size-4 text-ink-2" />
        </label>
      </div>

      <div aria-busy={pending} className={`mt-6 transition-opacity duration-200 ${pending ? "opacity-60" : ""}`}>
        {children}
      </div>
    </div>
  );
}
