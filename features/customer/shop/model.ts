import { sortSizes, unique } from "@/features/shared/catalog/catalog";

// The shop's product shape, categories, and URL filters. Safe for client components;
// loading the catalog is in data.ts.

export type ShopVariant = {
  /** The variant's id: what a cart line points at. */
  id: string;
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
  /** Tags customers see (not "featured"). */
  tags: string[];
  featured: boolean;
  /** The product's primary photo, when it has one. */
  image: string | null;
  /** Every photo, the main one first. */
  images: string[];
  /**
   * Made after it's ordered at the counter (the shop's jersey designs). It keeps no stock, so it's
   * always available; its "colors" are styles like "NBA cut · Set".
   */
  madeToOrder: boolean;
  /** The shop's design number, for made-to-order designs (from SKUs like D01-NBS-M). */
  designNumber: number | null;
  createdAt: string;
  variants: ShopVariant[];
};

/** Can be bought or ordered: in stock, or made to order. */
export const available = (p: Pick<ShopProduct, "madeToOrder" | "stock">) => p.madeToOrder || p.stock > 0;
export const variantAvailable = (p: Pick<ShopProduct, "madeToOrder">, v: Pick<ShopVariant, "stock">) => p.madeToOrder || v.stock > 0;

// ---------------------------------------------------------------------------
// Categories: quick filters built from tags
// ---------------------------------------------------------------------------

export type Category = { id: string; label: string; tags: string[] };

/** The shop's designs, made to order at the counter: a category of its own, not a tag. */
export const MADE_TO_ORDER = "made-to-order";

export const CATEGORIES: Category[] = [
  { id: MADE_TO_ORDER, label: "Made to order", tags: [] },
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
  if (c.id === MADE_TO_ORDER) return p.madeToOrder;
  return p.tags.some((t) => c.tags.includes(t.toLowerCase()));
}

/** Categories that hold at least one product, each with the product its tile shows. */
export function categoriesWithProducts(products: ShopProduct[]) {
  // Categories share products (a design is a jersey and basketball too), so each tile takes one
  // the others haven't shown yet, keeping the rail from repeating the same garment.
  const shown = new Set<string>();
  return CATEGORIES.map((c) => {
    const items = products.filter((p) => inCategory(p, c));
    const fresh = items.filter((p) => !shown.has(p.id));
    // The tile shows the category's most telling garment: a jersey if it has one in stock.
    const pick = (list: ShopProduct[]) =>
      list.find((p) => available(p) && p.tags.some((t) => t.toLowerCase() === "jersey")) ?? list.find(available) ?? list[0];
    const cover = pick(fresh) ?? pick(items) ?? null;
    if (cover) shown.add(cover.id);
    return { ...c, count: items.length, cover };
  }).filter((c) => c.count > 0);
}

/**
 * What leads the shop. The owner features a product by tagging it "featured" (a ready-made one
 * first, then a design); otherwise the first jersey in stock, then the newest design.
 */
export function pickFeatured(products: ShopProduct[]) {
  const ready = products.filter((p) => !p.madeToOrder && p.stock > 0);
  const designs = products.filter((p) => p.madeToOrder);
  const newest = [...designs].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || (b.designNumber ?? 0) - (a.designNumber ?? 0))[0];
  return (
    ready.find((p) => p.featured) ??
    designs.find((p) => p.featured) ??
    ready.find((p) => p.tags.some((t) => t.toLowerCase() === "jersey")) ??
    newest ??
    ready[0] ??
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
      // A size filter shows products that have that size in stock (or made to order), in any color.
      (!q.size || p.variants.some((v) => v.size.toLowerCase() === q.size.toLowerCase() && variantAvailable(p, v))) &&
      (!q.inStock || available(p)),
  );
  switch (q.sort) {
    case "price-asc":
      return [...list].sort((a, b) => a.priceMin - b.priceMin || a.name.localeCompare(b.name));
    case "price-desc":
      return [...list].sort((a, b) => b.priceMax - a.priceMax || a.name.localeCompare(b.name));
    case "name":
      return [...list].sort((a, b) => a.name.localeCompare(b.name));
    default:
      // Featured order: available first, then the owner's featured pick, then by category
      // (jerseys and team wear before accessories), then designs by number, then name.
      return [...list].sort(
        (a, b) =>
          Number(available(b)) - Number(available(a)) ||
          Number(b.featured) - Number(a.featured) ||
          categoryRank(a) - categoryRank(b) ||
          (a.designNumber ?? 0) - (b.designNumber ?? 0) ||
          a.name.localeCompare(b.name),
      );
  }
}

function categoryRank(p: ShopProduct) {
  if (p.tags.some((t) => t.toLowerCase() === "jersey")) return -1;
  const i = CATEGORIES.findIndex((c) => c.id !== MADE_TO_ORDER && inCategory(p, c));
  return i === -1 ? CATEGORIES.length : i;
}

/** Every size in the catalog, in the standard order, for the size filter. */
export function catalogSizes(products: ShopProduct[]) {
  return sortSizes(unique(products.flatMap((p) => p.variants.map((v) => v.size))));
}

/** The color a card or tile shows: the first one with stock (a design has none to show). */
export function leadColor(p: ShopProduct) {
  if (p.madeToOrder) return null;
  return p.colors.find((c) => p.variants.some((v) => v.color === c && v.stock > 0)) ?? p.colors[0] ?? null;
}
