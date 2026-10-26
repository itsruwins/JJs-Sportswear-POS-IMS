import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { LiveRefresh } from "@/features/shared/ui/live-refresh";
import { pageShell } from "@/features/customer/shell/components/page-parts";
import { SHOP } from "@/lib/shop";
import { available, CATEGORIES, inCategory, MADE_TO_ORDER, type ShopProduct } from "@/features/customer/shop/model";
import { DesignDetail } from "./design-detail";
import { ProductDetail } from "./product-detail";
import { ProductCard } from "./shop-parts";

const LIVE_TABLES = ["products", "product_variants"] as const;

/** A product page: the detail, then up to four more from its first category (a design's: more designs). */
export function ProductView({ product, products }: { product: ShopProduct; products: ShopProduct[] }) {
  const category =
    (product.madeToOrder ? CATEGORIES.find((c) => c.id === MADE_TO_ORDER) : CATEGORIES.find((c) => c.id !== MADE_TO_ORDER && inCategory(product, c))) ?? null;
  const related = category
    ? products.filter((p) => p.id !== product.id && inCategory(p, category) && available(p)).slice(0, 4)
    : [];
  const shop = { name: SHOP.name, address: SHOP.address, city: SHOP.city, phone: SHOP.phone, hours: SHOP.hours };

  return (
    <div className={pageShell}>
      <LiveRefresh tables={LIVE_TABLES} />
      <Link href="/shop" className="press -ml-2 mb-5 inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-[0.9375rem] font-medium text-ink-2 hover:text-ink">
        <ChevronLeft aria-hidden="true" className="size-4" />
        Shop
      </Link>

      {product.madeToOrder ? (
        <DesignDetail product={product} shop={shop} />
      ) : (
        <ProductDetail product={product} category={category?.label ?? null} shop={shop} />
      )}

      {related.length > 0 && category && (
        <section aria-labelledby="related-title" className="mt-16 border-t border-line pt-10 sm:mt-20">
          <div className="mb-5 flex items-baseline justify-between gap-4">
            <h2 id="related-title" className="voice-display text-[clamp(1.75rem,3vw,2.25rem)]">
              {product.madeToOrder ? "More designs" : `More in ${category.label}`}
            </h2>
            <Link href={`/shop?cat=${category.id}#products`} className="press text-[0.9375rem] font-semibold text-ink underline underline-offset-4 hover:no-underline">
              See all
            </Link>
          </div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-4 sm:gap-x-4 lg:gap-x-5">
            {related.map((p) => (
              <li key={p.id}>
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
