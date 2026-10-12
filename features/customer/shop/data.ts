import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCatalog, isSample, sortColors, sortSizes, unique, type CatalogProduct } from "@/features/shared/catalog/catalog";
import type { ShopProduct } from "./model";
import { sampleArt } from "@/features/customer/design/sample-art";

// The customer shop reads the same catalog as the admin; RLS already hides archived
// products and hidden sizes from customers, and the filters here repeat that for safety.

const HIDDEN_TAGS = new Set(["sample", "featured"]);

async function toShop(p: CatalogProduct): Promise<ShopProduct> {
  const live = p.variants.filter((v) => v.is_active);
  const variants = live.map((v) => ({
    size: v.size ?? "One size",
    color: v.color ?? "One color",
    price: v.price,
    stock: Math.max(0, v.stock_quantity),
    low: v.stock_quantity > 0 && v.stock_quantity <= v.low_stock_threshold,
  }));
  const prices = variants.map((v) => v.price);
  const art = await sampleArt(p.image);
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    priceMin: prices.length ? Math.min(...prices) : p.base_price,
    priceMax: prices.length ? Math.max(...prices) : p.base_price,
    colors: sortColors(unique(variants.map((v) => v.color))),
    sizes: sortSizes(unique(variants.map((v) => v.size))),
    stock: variants.reduce((sum, v) => sum + v.stock, 0),
    tags: p.tags.filter((t) => !HIDDEN_TAGS.has(t.toLowerCase())),
    sample: isSample(p),
    featured: p.tags.some((t) => t.toLowerCase() === "featured"),
    image: art ? null : p.image,
    art,
    variants,
  };
}

export async function fetchShop(supabase: SupabaseClient) {
  const { products, error } = await fetchCatalog(supabase);
  const shop = await Promise.all(products.filter((p) => p.is_active).map(toShop));
  return { products: shop, error };
}
