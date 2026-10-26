// Design orders taken at the POS: the shop's made-to-order designs, the order being built,
// and the money rules (at least half down, at most the total). Safe for client components.

import { roundPeso } from "@/features/admin/pos/amounts";

/** One size of one style of a design, as the counter offers it. */
export type DesignVariant = { id: string; size: string; price: number };
export type DesignStyle = { name: string; price: number; variants: DesignVariant[] };
export type Design = {
  id: string;
  name: string;
  image: string | null;
  tags: string[];
  /** The shop's design number (from SKUs like D01-NBS-M), for search; null when it has none. */
  number: number | null;
  priceFrom: number;
  styles: DesignStyle[];
};

/** The order being built: pieces per variant, across any number of designs. */
export type Pieces = Record<string, number>;

export type OrderLine = {
  variantId: string;
  designId: string;
  designName: string;
  style: string;
  size: string;
  price: number;
  quantity: number;
};

export type Buyer = { name: string; phone: string; team: string; neededBy: string; notes: string };
export const blankBuyer = (): Buyer => ({ name: "", phone: "", team: "", neededBy: "", notes: "" });

export const MAX_PIECES = 999;

/** The order's lines, in the order the designs were added, then style and size order. */
export function orderLines(designs: Design[], pieces: Pieces, designOrder: string[]): OrderLine[] {
  const byId = new Map(designs.map((d) => [d.id, d]));
  return designOrder.flatMap((id) => {
    const d = byId.get(id);
    if (!d) return [];
    return d.styles.flatMap((st) =>
      st.variants
        .filter((v) => (pieces[v.id] ?? 0) > 0)
        .map((v) => ({
          variantId: v.id,
          designId: d.id,
          designName: d.name,
          style: st.name,
          size: v.size,
          price: v.price,
          quantity: pieces[v.id],
        })),
    );
  });
}

export const totalOf = (lines: OrderLine[]) => roundPeso(lines.reduce((s, l) => s + l.price * l.quantity, 0));
export const piecesOf = (lines: OrderLine[]) => lines.reduce((s, l) => s + l.quantity, 0);
/** The least the buyer pays when ordering: half the total, rounded up to the peso (the database's rule). */
export const downPayment = (total: number) => Math.ceil(total / 2);

/** "M ×4, L ×3": a style's sizes as the slip and review write them. */
export function sizeRun(lines: OrderLine[]) {
  return lines.map((l) => `${l.size} ×${l.quantity}`).join(", ");
}

/** Phone numbers as typed, checked loosely: 7 to 13 digits (a landline or a PH mobile). */
export function phoneOk(phone: string) {
  const digits = phone.replace(/\D/g, "").length;
  return digits >= 7 && digits <= 13;
}

/** Today in Manila, as a date input value (needed-by can't be earlier). */
export function manilaDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
