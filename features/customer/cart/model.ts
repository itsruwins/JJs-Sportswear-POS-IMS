// The customer's cart: its line shape, how each line stands against today's stock, and
// its designs grouped into size runs. Safe for client components; reading it is in data.ts.

import { sortSizes } from "@/features/shared/catalog/catalog";

export const CART_MIGRATION = "supabase/migrations/20261023000000_customer_cart.sql";

/** The most pieces of one size and color (or a design's size) a cart line holds (the database's limit too). */
export const MAX_PER_LINE = 99;

export type CartLine = {
  variantId: string;
  quantity: number;
  /** Null when the shop no longer sells it (archived, or hidden from customers). */
  item: {
    productId: string;
    name: string;
    image: string | null;
    size: string;
    color: string;
    price: number;
    stock: number;
    low: boolean;
    /** A made-to-order design: no stock, "color" is its style (NBA cut · Set). */
    madeToOrder: boolean;
  } | null;
};

/**
 * How a line stands right now: fine, running low, more in the cart than the shop has,
 * sold out, or no longer sold. Stock isn't held, so this is read fresh on every visit.
 */
export type LineState = "ok" | "low" | "short" | "sold_out" | "unavailable";

export function lineState(l: CartLine): LineState {
  if (!l.item) return "unavailable";
  // A design is made after it's ordered: there's no stock to run out of.
  if (l.item.madeToOrder) return "ok";
  if (l.item.stock <= 0) return "sold_out";
  if (l.quantity > l.item.stock) return "short";
  return l.item.low ? "low" : "ok";
}

/** A line that can be bought as it stands (a short line counts at what's left). */
export const buyable = (l: CartLine) => {
  const s = lineState(l);
  return s === "ok" || s === "low" || s === "short";
};

/** A line for the ready-made part of the cart (anything that isn't a design, including what left the shop). */
export const isReadyLine = (l: CartLine) => !l.item?.madeToOrder;

/** Pieces and an estimated total at today's prices, counting only what's on the rack. */
export function cartSummary(lines: CartLine[]) {
  let pieces = 0;
  let total = 0;
  for (const l of lines) {
    if (!l.item || l.item.madeToOrder || !buyable(l)) continue;
    const q = Math.min(l.quantity, l.item.stock);
    pieces += q;
    total += q * l.item.price;
  }
  return { pieces, total };
}

export const piecesLabel = (n: number) => (n === 1 ? "1 piece" : `${n} pieces`);

/** One design in one style, as the cart shows it: its sizes in size order. */
export type DesignRun = {
  key: string;
  productId: string;
  name: string;
  image: string | null;
  style: string;
  lines: (CartLine & { item: NonNullable<CartLine["item"]> })[];
  pieces: number;
  total: number;
};

/** The cart's designs, one run per design and style, in the order they were first added. */
export function designRuns(lines: CartLine[]): DesignRun[] {
  const runs = new Map<string, DesignRun>();
  for (const l of lines) {
    const item = l.item;
    if (!item?.madeToOrder) continue;
    const key = `${item.productId}|${item.color}`;
    const run = runs.get(key) ?? { key, productId: item.productId, name: item.name, image: item.image, style: item.color, lines: [], pieces: 0, total: 0 };
    run.lines.push({ ...l, item });
    run.pieces += l.quantity;
    run.total += l.quantity * item.price;
    runs.set(key, run);
  }
  return [...runs.values()].map((r) => {
    const order = sortSizes(r.lines.map((l) => l.item.size));
    return { ...r, lines: [...r.lines].sort((a, b) => order.indexOf(a.item.size) - order.indexOf(b.item.size)) };
  });
}

/** Pieces and total for the designs in the cart. */
export function designSummary(runs: DesignRun[]) {
  return { pieces: runs.reduce((n, r) => n + r.pieces, 0), total: Math.round(runs.reduce((n, r) => n + r.total, 0) * 100) / 100 };
}

/** "S ×3, M ×5, L ×4" */
export const runLabel = (sizes: { size: string; quantity: number }[]) => sizes.map((s) => `${s.size} ×${s.quantity}`).join(", ");
