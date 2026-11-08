// The customer's cart: its line shape and how each line stands against today's stock.
// Safe for client components; reading the cart is in data.ts.

export const CART_MIGRATION = "supabase/migrations/20261023000000_customer_cart.sql";

/** The most pieces of one size and color a cart line holds (the database's limit too). */
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
  } | null;
};

/**
 * How a line stands right now: fine, running low, more in the cart than the shop has,
 * sold out, or no longer sold. Stock isn't held, so this is read fresh on every visit.
 */
export type LineState = "ok" | "low" | "short" | "sold_out" | "unavailable";

export function lineState(l: CartLine): LineState {
  if (!l.item) return "unavailable";
  if (l.item.stock <= 0) return "sold_out";
  if (l.quantity > l.item.stock) return "short";
  return l.item.low ? "low" : "ok";
}

/** A line that can be bought as it stands (a short line counts at what's left). */
export const buyable = (l: CartLine) => {
  const s = lineState(l);
  return s === "ok" || s === "low" || s === "short";
};

/** Pieces and an estimated total at today's prices, counting only what's on the rack. */
export function cartSummary(lines: CartLine[]) {
  let pieces = 0;
  let total = 0;
  for (const l of lines) {
    if (!l.item || !buyable(l)) continue;
    const q = Math.min(l.quantity, l.item.stock);
    pieces += q;
    total += q * l.item.price;
  }
  return { pieces, total };
}

export const piecesLabel = (n: number) => (n === 1 ? "1 piece" : `${n} pieces`);
