import { sortSizes, unique } from "@/lib/admin/catalog";

// The shop's product shape, categories, and URL filters. Safe for client components;
// loading the catalog (which reads the sample illustrations from disk) is in shop-data.ts.

export type ShopVariant = {
  size: string;
  color: string;
  price: number;
  stock: number;
  low: boolean;
};

export type ShopProduct = {
  id: string;
  name: string;
  description: string | null;
  priceMin: number;
  priceMax: number;
  colors: string[];
  sizes: string[];
  stock: number;
  /** Tags customers see (not "sample" or "featured"). */
  tags: string[];
  sample: boolean;
  featured: boolean;
  /** A real photo, when the product has one. */
  image: string | null;
  /** Recolorable sample illustration markup, when the image is one. */
  art: string | null;
  variants: ShopVariant[];
};

// ---------------------------------------------------------------------------
// Categories: quick filters built from tags
// ---------------------------------------------------------------------------

export type Category = { id: string; label: string; tags: string[] };

export const CATEGORIES: Category[] = [
  { id: "basketball", label: "Basketball", tags: ["basketball"] },
  { id: "volleyball", label: "Volleyball", tags: ["volleyball"] },
  { id: "jerseys", label: "Jerseys", tags: ["jersey"] },
  { id: "shorts", label: "Shorts", tags: ["shorts", "spandex"] },
  { id: "training", label: "Training", tags: ["training", "pinnie", "dri-fit"] },
  { id: "outerwear", label: "Outerwear", tags: ["jacket", "hoodie", "warmer"] },
  { id: "uniforms", label: "Uniforms", tags: ["uniform", "polo"] },
  { id: "accessories", label: "Accessories", tags: ["accessory"] },
];

export function inCategory(p: ShopProduct, c: Category) {
  return p.tags.some((t) => c.tags.includes(t.toLowerCase()));
}

/** Categories that hold at least one product, each with the product its tile shows. */
export function categoriesWithProducts(products: ShopProduct[]) {
  return CATEGORIES.map((c) => {
    const items = products.filter((p) => inCategory(p, c));
    // The tile shows the category's most telling garment: a jersey if it has one in stock.
    const cover =
      items.find((p) => p.stock > 0 && p.tags.some((t) => t.toLowerCase() === "jersey")) ??
      items.find((p) => p.stock > 0) ??
      items[0] ??
      null;
    return { ...c, count: items.length, cover };
  }).filter((c) => c.count > 0);
}

/** The owner features a product by tagging it "featured"; otherwise the first jersey in stock leads. */
export function pickFeatured(products: ShopProduct[]) {
  const inStock = products.filter((p) => p.stock > 0);
  return (
    inStock.find((p) => p.featured) ??
    inStock.find((p) => p.tags.some((t) => t.toLowerCase() === "jersey")) ??
    inStock[0] ??
    null
  );
}

// ---------------------------------------------------------------------------
// Search, filters, and sort (kept in the URL)
// ---------------------------------------------------------------------------

export type Sort = "featured" | "price-asc" | "price-desc" | "name";
export const SORTS: { id: Sort; label: string }[] = [
  { id: "featured", label: "Featured" },
  { id: "price-asc", label: "Price: low to high" },
  { id: "price-desc", label: "Price: high to low" },
  { id: "name", label: "Name" },
];

export type ShopQuery = { q: string; cat: string; size: string; inStock: boolean; sort: Sort };

export function readQuery(params: Record<string, string | string[] | undefined>): ShopQuery {
  const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? "").trim();
  const sort = one(params.sort) as Sort;
  return {
    q: one(params.q).slice(0, 80),
    cat: CATEGORIES.some((c) => c.id === one(params.cat)) ? one(params.cat) : "",
    size: one(params.size).slice(0, 20),
    inStock: one(params.stock) === "1",
    sort: SORTS.some((s) => s.id === sort) ? sort : "featured",
  };
}

export function isFiltered(q: ShopQuery) {
  return Boolean(q.q || q.cat || q.size || q.inStock);
}

/** Every word must match the product's name, description, or tags. */
function matchesSearch(p: ShopProduct, search: string) {
  const hay = [p.name, p.description ?? "", ...p.tags].join(" ").toLowerCase();
  return search
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export function applyQuery(products: ShopProduct[], q: ShopQuery) {
  const cat = CATEGORIES.find((c) => c.id === q.cat);
  const list = products.filter(
    (p) =>
      (!q.q || matchesSearch(p, q.q)) &&
      (!cat || inCategory(p, cat)) &&
      // A size filter shows products that have that size in stock, in any color.
      (!q.size || p.variants.some((v) => v.size.toLowerCase() === q.size.toLowerCase() && v.stock > 0)) &&
      (!q.inStock || p.stock > 0),
  );
  switch (q.sort) {
    case "price-asc":
      return [...list].sort((a, b) => a.priceMin - b.priceMin || a.name.localeCompare(b.name));
    case "price-desc":
      return [...list].sort((a, b) => b.priceMax - a.priceMax || a.name.localeCompare(b.name));
    case "name":
      return [...list].sort((a, b) => a.name.localeCompare(b.name));
    default:
      // Featured order: in stock first, then the owner's featured pick, then by category
      // (jerseys and team wear before accessories), then name.
      return [...list].sort(
        (a, b) =>
          Number(b.stock > 0) - Number(a.stock > 0) ||
          Number(b.featured) - Number(a.featured) ||
          categoryRank(a) - categoryRank(b) ||
          a.name.localeCompare(b.name),
      );
  }
}

function categoryRank(p: ShopProduct) {
  if (p.tags.some((t) => t.toLowerCase() === "jersey")) return -1;
  const i = CATEGORIES.findIndex((c) => inCategory(p, c));
  return i === -1 ? CATEGORIES.length : i;
}

/** Every size in the catalog, in the standard order, for the size filter. */
export function catalogSizes(products: ShopProduct[]) {
  return sortSizes(unique(products.flatMap((p) => p.variants.map((v) => v.size))));
}

/** The color a card or tile shows: the first one with stock. */
export function leadColor(p: ShopProduct) {
  return p.colors.find((c) => p.variants.some((v) => v.color === c && v.stock > 0)) ?? p.colors[0] ?? null;
}
