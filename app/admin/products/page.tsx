import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { LiveRefresh } from "@/features/shared/ui/live-refresh";
import { ProductsBrowser, type Filter, type Sort } from "@/components/admin/products/products-browser";
import { fetchCatalog } from "@/features/shared/catalog/catalog";
import { requireStaff } from "@/lib/admin/session";

export const metadata: Metadata = { title: "Products · J&J Sportswear Admin" };

const FILTERS: Filter[] = ["active", "low", "out", "archived"];
const SORTS: Sort[] = ["name", "attention", "updated"];

export default async function ProductsPage({ searchParams }: PageProps<"/admin/products">) {
  const { supabase, profile } = await requireStaff();
  const isOwner = profile.role === "owner";
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

  const filter = FILTERS.includes(one(params.filter) as Filter) ? (one(params.filter) as Filter) : "active";
  const sort = SORTS.includes(one(params.sort) as Sort) ? (one(params.sort) as Sort) : "name";

  const { products, error } = await fetchCatalog(supabase);

  return (
    <div className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10">
      <LiveRefresh />
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="voice-display text-[clamp(2.25rem,5vw,3.5rem)]">Products</h1>
          <p className="mt-2 text-[0.9375rem] text-ink-2">
            {isOwner
              ? "Everything in the catalog, with stock for every size at a glance."
              : "Look up any item’s stock by size, design, and color."}
          </p>
        </div>
        {isOwner && (
          <Link
            href="/admin/products/new"
            className="press inline-flex h-11 items-center gap-2 rounded-xl bg-board px-5 text-[0.9375rem] font-semibold text-board-ink hover:bg-board-deep"
          >
            <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} />
            Add product
          </Link>
        )}
      </header>
      {one(params.deleted) === "1" && (
        <p role="status" className="mb-6 rounded-xl bg-ground-2 px-4 py-3 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)]">
          Product deleted.
        </p>
      )}

      {error ? (
        <p role="alert" className="auth-alert rounded-2xl px-5 py-4 text-[0.9375rem]">
          We couldn’t load the products just now. Refresh the page to try again.
        </p>
      ) : (
        <ProductsBrowser products={products} initialQuery={one(params.q)} initialFilter={filter} initialSort={sort} canEdit={isOwner} />
      )}
    </div>
  );
}
