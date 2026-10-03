import type { SupabaseClient } from "@supabase/supabase-js";

export type CatalogVariant = {
  id: string;
  size: string | null;
  color: string | null;
  sku: string | null;
  price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  is_active: boolean;
};

export type CatalogProduct = {
  id: string;
  name: string;
  description: string | null;
  base_price: number;
  is_active: boolean;
  updated_at: string;
  variants: CatalogVariant[];
  tags: string[];
  image: string | null;
};

type ProductRow = Omit<CatalogProduct, "variants" | "tags" | "image"> & {
  product_variants: CatalogVariant[] | null;
  product_tags: { tag: string }[] | null;
  product_images: { image_url: string; is_primary: boolean }[] | null;
};

const PRODUCT_SELECT = `
  id, name, description, base_price, is_active, updated_at,
  product_variants (id, size, color, sku, price, stock_quantity, low_stock_threshold, is_active),
  product_tags (tag),
  product_images (image_url, is_primary)
`;

function toProduct(row: ProductRow): CatalogProduct {
  const images = row.product_images ?? [];
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    base_price: Number(row.base_price),
    is_active: row.is_active,
    updated_at: row.updated_at,
    variants: (row.product_variants ?? []).map((v) => ({ ...v, price: Number(v.price) })),
    tags: (row.product_tags ?? []).map((t) => t.tag),
    image: (images.find((i) => i.is_primary) ?? images[0])?.image_url ?? null,
  };
}

/** Every product, active or archived, with its variants, tags, and primary image. Staff only (RLS). */
export async function fetchCatalog(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("products").select(PRODUCT_SELECT).order("name");
  return { products: (data as ProductRow[] | null)?.map(toProduct) ?? [], error };
}

export async function fetchProduct(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from("products").select(PRODUCT_SELECT).eq("id", id).maybeSingle();
  return { product: data ? toProduct(data as ProductRow) : null, error };
}

// ---------------------------------------------------------------------------
// Sizes, colors, and stock state
// ---------------------------------------------------------------------------

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"];

/** A size's place in apparel order; combined sizes like "S/M" rank by their first size. */
function sizeRank(size: string) {
  return SIZE_ORDER.indexOf(size.toUpperCase().split("/")[0].trim());
}

/** Standard apparel order first (XS → 3XL), anything else after it alphabetically. */
export function sortSizes(sizes: string[]) {
  return [...sizes].sort((a, b) => {
    const ia = sizeRank(a);
    const ib = sizeRank(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    return a.localeCompare(b);
  });
}

/** Distinct non-empty values, in first-seen order. */
export function unique(values: (string | null)[]) {
  return [...new Set(values.filter((v): v is string => Boolean(v)))];
}

export function sortColors(colors: string[]) {
  return [...colors].sort((a, b) => a.localeCompare(b));
}

export type StockState = "in" | "low" | "zero";

export function variantState(v: Pick<CatalogVariant, "stock_quantity" | "low_stock_threshold">): StockState {
  if (v.stock_quantity <= 0) return "zero";
  if (v.stock_quantity <= v.low_stock_threshold) return "low";
  return "in";
}

export type SizeSummary = {
  size: string;
  total: number;
  state: StockState;
  /** At least one color of this size is sold out (while others still have stock). */
  colorOut: boolean;
  byColor: { color: string; qty: number }[];
};

/**
 * Stock per size across colors, for the list's size rail. A size reads "zero" when
 * none are left in any color, and "low" when any one color is low or sold out.
 */
export function sizeSummaries(product: CatalogProduct): SizeSummary[] {
  const live = product.variants.filter((v) => v.is_active);
  const sizes = sortSizes(unique(live.map((v) => v.size ?? "One size")));
  return sizes.map((size) => {
    const vs = live.filter((v) => (v.size ?? "One size") === size);
    const total = vs.reduce((sum, v) => sum + v.stock_quantity, 0);
    const state: StockState =
      total <= 0 ? "zero" : vs.some((v) => variantState(v) !== "in") ? "low" : "in";
    const colorOut = total > 0 && vs.some((v) => v.stock_quantity <= 0);
    return { size, total, state, colorOut, byColor: vs.map((v) => ({ color: v.color ?? "—", qty: v.stock_quantity })) };
  });
}

export function productStock(product: CatalogProduct) {
  const live = product.variants.filter((v) => v.is_active);
  const states = live.map(variantState);
  return {
    total: live.reduce((sum, v) => sum + v.stock_quantity, 0),
    low: states.filter((s) => s === "low").length,
    zero: states.filter((s) => s === "zero").length,
  };
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
const pesoCents = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 });

export function formatPeso(amount: number) {
  return Number.isInteger(amount) ? peso.format(amount) : pesoCents.format(amount);
}

export function priceRange(product: CatalogProduct) {
  const prices = product.variants.filter((v) => v.is_active).map((v) => v.price);
  if (prices.length === 0) return formatPeso(product.base_price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatPeso(min) : `${formatPeso(min)}–${formatPeso(max)}`;
}

export function isSample(product: Pick<CatalogProduct, "tags">) {
  return product.tags.some((t) => t.toLowerCase() === "sample");
}
