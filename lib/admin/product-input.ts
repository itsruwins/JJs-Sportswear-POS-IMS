// What the product form sends to the server, and the rules both sides check.

export type VariantInput = {
  /** Present for variants that already exist. */
  id?: string;
  size: string;
  color: string;
  sku: string;
  price: number;
  low_stock_threshold: number;
  /** Only for new variants; existing stock changes through stock adjustments. */
  opening_stock: number;
  is_active: boolean;
};

export type ImageInput = {
  /** Present for photos already saved. */
  id?: string;
  url: string;
  is_primary: boolean;
};

export type ProductInput = {
  id: string;
  name: string;
  description: string;
  base_price: number;
  tags: string[];
  images: ImageInput[];
  /**
   * Every photo URL this form has shown (loaded or uploaded). Saved photos not in \`images\`
   * are removed only if they're listed here, so photos another staff member just added survive.
   */
  known_image_urls: string[];
  variants: VariantInput[];
};

export type FieldErrors = Partial<Record<string, string>>;

export const LIMITS = {
  name: 120,
  description: 2000,
  tags: 12,
  tag: 30,
  images: 6,
  sku: 40,
  price: 1_000_000,
  stock: 100_000,
};

export const SKU_PATTERN = /^[A-Z0-9][A-Z0-9-]*$/;

const isWhole = (n: number) => Number.isInteger(n) && n >= 0;
const isMoney = (n: number) =>
  Number.isFinite(n) && n >= 0 && n <= LIMITS.price && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

export function variantKey(v: Pick<VariantInput, "color" | "size">) {
  return `${v.color}\u0000${v.size}`;
}

/** Checks a product before it's saved. Returns field errors keyed by field ("name", "variants.<key>.sku", …). */
export function validateProduct(input: ProductInput): FieldErrors {
  const e: FieldErrors = {};
  const name = input.name.trim();

  if (!name) e.name = "Give the product a name.";
  else if (name.length > LIMITS.name) e.name = `Keep the name under ${LIMITS.name} characters.`;

  if (input.description.length > LIMITS.description) e.description = `Keep the description under ${LIMITS.description} characters.`;

  if (!isMoney(input.base_price)) e.base_price = "Enter a price in pesos, like 650 or 650.50.";

  if (input.tags.length > LIMITS.tags) e.tags = `Use up to ${LIMITS.tags} tags.`;
  else if (input.tags.some((t) => t.length > LIMITS.tag)) e.tags = `Keep each tag under ${LIMITS.tag} characters.`;

  if (input.images.length > LIMITS.images) e.images = `Add up to ${LIMITS.images} photos.`;
  else if (input.images.length > 0 && input.images.filter((i) => i.is_primary).length !== 1) e.images = "Choose one main photo.";

  if (input.variants.length === 0) e.variants = "Pick at least one size and one color.";

  const seen = new Map<string, string>();
  const pairs = new Set<string>();
  for (const v of input.variants) {
    const k = variantKey(v);
    if (!v.size.trim() || !v.color.trim() || v.size.length > 40 || v.color.length > 40) {
      e.variants = "Every variant needs a size and a color.";
      continue;
    }
    if (pairs.has(k)) {
      e.variants = `${v.color} ${v.size} is listed twice.`;
      continue;
    }
    pairs.add(k);
    const sku = v.sku.trim();
    if (!sku) e[`variants.${k}.sku`] = "Add a SKU.";
    else if (sku.length > LIMITS.sku || !SKU_PATTERN.test(sku)) e[`variants.${k}.sku`] = "Use capital letters, numbers, and dashes.";
    else if (seen.has(sku)) e[`variants.${k}.sku`] = `Same SKU as ${seen.get(sku)}.`;
    else seen.set(sku, `${v.color} ${v.size}`);

    if (!isMoney(v.price)) e[`variants.${k}.price`] = "Enter a price.";
    if (!isWhole(v.low_stock_threshold) || v.low_stock_threshold > LIMITS.stock) e[`variants.${k}.low_stock_threshold`] = "Whole number.";
    if (!v.id && (!isWhole(v.opening_stock) || v.opening_stock > LIMITS.stock)) e[`variants.${k}.opening_stock`] = "Whole number.";
  }

  return e;
}

/** Normalizes tags: trimmed, lowercase, single-spaced, no duplicates. */
export function normalizeTags(tags: string[]) {
  const out: string[] = [];
  for (const t of tags) {
    const tag = t.trim().toLowerCase().replace(/\s+/g, " ");
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

/** "1,250" or "1,099.90": how prices read in the form once typed. */
export function formatMoneyInput(n: number) {
  if (!Number.isFinite(n)) return "";
  const rounded = Math.round(n * 100) / 100;
  return rounded.toLocaleString("en-PH", {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
