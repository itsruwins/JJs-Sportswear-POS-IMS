import { LiveRefresh } from "@/components/admin/live-refresh";
import { pageShell } from "@/components/customer/page-parts";
import {
  applyQuery,
  catalogSizes,
  categoriesWithProducts,
  CATEGORIES,
  pickFeatured,
  type ShopProduct,
  type ShopQuery,
} from "@/lib/customer/catalog";
import { ShopControls } from "./shop-controls";
import { CategoryRail, FeaturedBand, ProductCard } from "./shop-parts";

const LIVE_TABLES = ["products", "product_variants"] as const;

/** The Shop tab: featured product, shop by sport, then every product with filters. */
export function ShopView({ products, error, query }: { products: ShopProduct[]; error: boolean; query: ShopQuery }) {
  const featured = pickFeatured(products);
  const categories = categoriesWithProducts(products);
  const results = applyQuery(products, query);
  const heading = CATEGORIES.find((c) => c.id === query.cat)?.label ?? "All products";
  const hasSamples = products.some((p) => p.sample);

  return (
    <div className={pageShell}>
      <LiveRefresh tables={LIVE_TABLES} />
      <h1 className="sr-only">Shop</h1>

      {error ? (
        <p role="alert" className="auth-alert rounded-2xl px-5 py-4 text-[0.9375rem]">
          We couldn’t load the shop just now. Check your connection, then refresh the page.
        </p>
      ) : products.length === 0 ? (
        <section className="max-w-[46rem] rounded-[1.25rem] bg-ground-2 px-6 py-7 shadow-[inset_0_0_0_1px_var(--line)]">
          <h2 className="text-[1.125rem] font-semibold text-ink">The rack is empty right now.</h2>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">
            The shop hasn’t listed any ready-made items yet. Check back soon.
          </p>
        </section>
      ) : (
        <>
          {featured && <FeaturedBand product={featured} />}
          <CategoryRail categories={categories} current={query.cat} />

          <section id="products" aria-labelledby="products-title" className="mt-14 scroll-mt-24 sm:mt-16">
            <h2 id="products-title" className="voice-display mb-5 text-[clamp(1.75rem,3vw,2.25rem)]">
              {heading}
            </h2>
            <ShopControls
              query={query}
              chips={categories.map((c) => ({ id: c.id, label: c.label }))}
              sizes={catalogSizes(products)}
              count={results.length}
            >
              {results.length > 0 ? (
                <ul className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4 lg:gap-x-5">
                  {results.map((p) => (
                    <li key={p.id}>
                      <ProductCard product={p} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-[1.25rem] bg-ground-2 px-6 py-8 text-center shadow-[inset_0_0_0_1px_var(--line)]">
                  <p className="text-[1.0625rem] font-semibold text-ink">Nothing matches those filters.</p>
                  <p className="mt-1.5 text-[0.9375rem] text-ink-2">
                    Try another size or sport, or clear the filters to see everything.
                  </p>
                </div>
              )}
            </ShopControls>
          </section>

          <p className="mt-14 max-w-[60ch] border-t border-line pt-5 text-[0.875rem] leading-relaxed text-ink-2">
            Ready-made items are bought at the shop in Legazpi City; stock updates as the counter sells.
            {hasSamples && " The products, prices, and illustrations here are sample data until the shop’s real catalog goes in."}
          </p>
        </>
      )}
    </div>
  );
}
