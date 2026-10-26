import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCatalog, sortColors, sortSizes, unique, type CatalogProduct } from "@/features/shared/catalog/catalog";
import { JERSEY_STYLES } from "@/features/shared/catalog/styles";
import type { ShopProduct } from "./model";

// The customer shop reads the same catalog as the admin; RLS already hides archived
// products and hidden sizes from customers, and the filters here repeat that for safety.
// Made-to-order designs are in it too, ordered at the counter rather than bought off the rack.

const HIDDEN_TAGS = new Set(["featured"]);

/** A design's styles in the shop's own order (NBA cut · Set first), any others after by name. */
function sortStyles(styles: string[]) {
  const rank = (s: string) => {
    const i = JERSEY_STYLES.findIndex((j) => j.name === s);
    return i === -1 ? JERSEY_STYLES.length : i;
  };
  return [...styles].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function toShop(p: CatalogProduct): ShopProduct {
  const live = p.variants.filter((v) => v.is_active);
  const variants = live.map((v) => ({
    size: v.size ?? "One size",
    color: v.color ?? "One color",
    price: v.price,
    stock: p.made_to_order ? 0 : Math.max(0, v.stock_quantity),
    low: !p.made_to_order && v.stock_quantity > 0 && v.stock_quantity <= v.low_stock_threshold,
  }));
  const prices = variants.map((v) => v.price);
  const colors = unique(variants.map((v) => v.color));
  const number = p.made_to_order ? live.map((v) => /^D(\d+)-/.exec(v.sku ?? "")?.[1]).find(Boolean) : undefined;
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    priceMin: prices.length ? Math.min(...prices) : p.base_price,
    priceMax: prices.length ? Math.max(...prices) : p.base_price,
    colors: p.made_to_order ? sortStyles(colors) : sortColors(colors),
    sizes: sortSizes(unique(variants.map((v) => v.size))),
    stock: variants.reduce((sum, v) => sum + v.stock, 0),
    tags: p.tags.filter((t) => !HIDDEN_TAGS.has(t.toLowerCase())),
    featured: p.tags.some((t) => t.toLowerCase() === "featured"),
    image: p.image,
    images: p.images,
    madeToOrder: p.made_to_order,
    designNumber: number ? Number(number) : null,
    createdAt: p.created_at,
    variants,
  };
}

export async function fetchShop(supabase: SupabaseClient) {
  const { products, error } = await fetchCatalog(supabase);
  return { products: products.filter((p) => p.is_active).map(toShop), error };
}
