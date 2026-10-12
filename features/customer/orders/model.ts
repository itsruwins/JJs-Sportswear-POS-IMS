// Custom-order requests on the customer side: the garment list, size fits, and the
// mapping between the request form (one card per garment, with a size run) and the
// order lines the database stores (one line per garment, color, and size).
// Safe for client components.

import { SIZE_GROUPS } from "@/features/shared/catalog/sizes";

export type OrderStatus = "pending" | "accepted" | "in_progress" | "ready" | "completed" | "declined" | "cancelled";

/** What the customer sees for each status (the admin calls pending "New"). */
export const STATUS_TEXT: Record<OrderStatus, string> = {
  pending: "Waiting for the shop",
  accepted: "Accepted",
  in_progress: "In production",
  ready: "Ready for pickup",
  completed: "Picked up",
  declined: "Declined",
  cancelled: "Cancelled",
};

export type Step = "printing" | "cutting" | "sewing" | "inspection" | "packing";

/** The shop's production steps, in order (as the admin ticks them off). */
export const STEPS: { id: Step; label: string }[] = [
  { id: "printing", label: "Printing" },
  { id: "cutting", label: "Cutting" },
  { id: "sewing", label: "Sewing" },
  { id: "inspection", label: "Inspection" },
  { id: "packing", label: "Folding and packing" },
];

export type MyPayment = {
  id: string;
  payment_type: "down_payment" | "balance";
  amount: number;
  /** "gcash" only on payments read before providers. */
  method: "cash" | "e_payment" | "gcash";
  /** The e-wallet or bank, for e-payments. */
  providerName: string | null;
  status: "pending" | "submitted" | "verified" | "rejected";
  last4: string | null;
  rejection_reason: string | null;
  created_at: string;
  verified_at: string | null;
};

/** The shop asks for at least half before production, rounded up to the peso (as the admin does). */
export const downPaymentOf = (total: number) => Math.ceil(total / 2);

export type Money = {
  total: number;
  down: number;
  /** Verified by the shop. */
  paid: number;
  /** Sent by the customer, not checked yet. */
  waiting: number;
  /** Still owed once waiting payments are counted: what the customer could pay now. */
  left: number;
  /** What's still missing from the down payment, waiting payments counted. */
  downLeft: number;
};

export function moneyOf(total: number | null, payments: Pick<MyPayment, "amount" | "status">[]): Money | null {
  if (total === null) return null;
  const paid = payments.filter((p) => p.status === "verified").reduce((sum, p) => sum + p.amount, 0);
  const waiting = payments.filter((p) => p.status === "submitted").reduce((sum, p) => sum + p.amount, 0);
  const down = downPaymentOf(total);
  return {
    total,
    down,
    paid,
    waiting,
    left: Math.max(0, total - paid - waiting),
    downLeft: Math.max(0, down - paid - waiting),
  };
}

/** What the customer has to do about money now, if anything (the only amber in the app). */
export function payAction(status: OrderStatus, money: Money | null): { kind: "down" | "balance"; amount: number } | null {
  if (!money) return null;
  if (status === "accepted" && money.downLeft > 0) return { kind: "down", amount: money.downLeft };
  if ((status === "ready" || status === "completed") && money.left > 0) return { kind: "balance", amount: money.left };
  return null;
}

/** Whether the order can take an e-payment from the customer now (the database's rule). */
export const canPay = (status: OrderStatus, money: Money | null) =>
  Boolean(money && money.left > 0 && ["accepted", "in_progress", "ready", "completed"].includes(status));

export type Fit = "adult" | "women" | "kids" | "one";

const groupSizes = (id: string) => SIZE_GROUPS.find((g) => g.id === id)?.sizes ?? [];

export const FITS: { id: Fit; label: string; sizes: string[] }[] = [
  { id: "adult", label: "Adult", sizes: groupSizes("adult") },
  { id: "women", label: "Women’s", sizes: groupSizes("women") },
  { id: "kids", label: "Kids", sizes: groupSizes("kids") },
  { id: "one", label: "One size", sizes: ["One size"] },
];

export const fitOf = (id: Fit) => FITS.find((f) => f.id === id) ?? FITS[0];

/** The shop's garment types. Caps and socks come in one size; "Other" lets the customer type it. */
export const GARMENTS: { name: string; fit: Fit }[] = [
  { name: "Jersey", fit: "adult" },
  { name: "Reversible jersey", fit: "adult" },
  { name: "Sublimated jersey", fit: "adult" },
  { name: "Shorts", fit: "adult" },
  { name: "Dri-fit shirt", fit: "adult" },
  { name: "Polo", fit: "adult" },
  { name: "Jacket", fit: "adult" },
  { name: "Hoodie", fit: "adult" },
  { name: "Pinnie", fit: "adult" },
  { name: "Cap", fit: "one" },
  { name: "Socks", fit: "one" },
];

export const OTHER = "Other";

/** Colors to suggest while typing; any color can be written. */
export const COLOR_SUGGESTIONS = [
  "Black", "White", "Navy", "Royal", "Red", "Maroon", "Court green", "Orange", "Yellow", "Neon yellow",
  "Blue", "Charcoal", "Heather gray", "Purple", "Pink",
];

export const MAX_REFERENCES = 3;
export const MAX_GARMENTS = 12;

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

export type GarmentDraft = {
  key: string;
  /** One of GARMENTS, or OTHER with `other` holding the typed name. */
  garment: string;
  other: string;
  color: string;
  fit: Fit;
  /** Pieces per size, for the sizes of `fit`. */
  qty: Record<string, number>;
  /** Names and numbers, or anything else about this garment. */
  notes: string;
};

export type ReferenceImage = { path: string; url: string | null };

export type RequestDraft = {
  team: string;
  description: string;
  /** yyyy-mm-dd, or "" when not needed by a date. */
  neededBy: string;
  notes: string;
  references: ReferenceImage[];
  garments: GarmentDraft[];
  /** A design from the AI studio, attached for the shop to work from. */
  design: AttachedDesign | null;
};

export type AttachedDesign = { id: string; url: string | null; label: string };

export type OrderLine = { garment: string; color: string | null; size: string; quantity: number; notes: string | null };

let keySeq = 0;
export const newKey = () => `g${Date.now().toString(36)}${(keySeq++).toString(36)}`;

export function blankGarment(garment = GARMENTS[0].name, color = ""): GarmentDraft {
  const known = GARMENTS.find((g) => g.name === garment);
  return { key: newKey(), garment: known ? garment : OTHER, other: known ? "" : garment, color, fit: known?.fit ?? "adult", qty: {}, notes: "" };
}

export const garmentName = (g: GarmentDraft) => (g.garment === OTHER ? g.other.trim() : g.garment);

export const piecesOf = (g: GarmentDraft) => fitOf(g.fit).sizes.reduce((sum, s) => sum + (g.qty[s] ?? 0), 0);

export const totalPieces = (d: Pick<RequestDraft, "garments">) => d.garments.reduce((sum, g) => sum + piecesOf(g), 0);

/** The size run in words: "S ×2 · M ×5 · L ×4" (the × keeps kids' sizes and counts apart). */
export function sizeRunText(g: GarmentDraft) {
  return fitOf(g.fit)
    .sizes.filter((s) => (g.qty[s] ?? 0) > 0)
    .map((s) => (g.fit === "one" ? `${g.qty[s]} pcs` : `${s} ×${g.qty[s]}`))
    .join(" · ");
}

/** Form → order lines: one line per size with pieces; a garment's notes ride on its first line. */
export function toLines(garments: GarmentDraft[]): OrderLine[] {
  return garments.flatMap((g) => {
    const sizes = fitOf(g.fit).sizes.filter((s) => (g.qty[s] ?? 0) > 0);
    return sizes.map((size, i) => ({
      garment: garmentName(g),
      color: g.color.trim() || null,
      size,
      quantity: g.qty[size],
      notes: i === 0 ? g.notes.trim() || null : null,
    }));
  });
}

function fitForSizes(sizes: string[]): Fit {
  if (sizes.every((s) => s === "One size")) return "one";
  for (const f of FITS) if (sizes.every((s) => f.sizes.includes(s))) return f.id;
  return "adult";
}

/** Order lines → form: lines with the same garment and color become one card again. */
export function fromLines(lines: OrderLine[]): GarmentDraft[] {
  const cards: { garment: string; color: string; lines: OrderLine[] }[] = [];
  for (const line of lines) {
    const color = line.color ?? "";
    const card = cards.find((c) => c.garment === line.garment && c.color === color);
    if (card) card.lines.push(line);
    else cards.push({ garment: line.garment, color, lines: [line] });
  }
  return cards.map((c) => {
    const draft = blankGarment(c.garment, c.color);
    draft.fit = fitForSizes(c.lines.map((l) => l.size));
    for (const l of c.lines) draft.qty[l.size] = (draft.qty[l.size] ?? 0) + l.quantity;
    draft.notes = c.lines.map((l) => l.notes).filter(Boolean).join("\n");
    return draft;
  });
}

/** "Make a custom version" from a shop product: the closest garment type for it. */
export function garmentForProduct(name: string, tags: string[]) {
  const has = (t: string) => tags.some((x) => x.toLowerCase() === t);
  if (has("reversible")) return "Reversible jersey";
  if (has("sublimation")) return "Sublimated jersey";
  if (has("jersey")) return "Jersey";
  if (has("shorts") || has("spandex")) return "Shorts";
  if (has("polo")) return "Polo";
  if (has("jacket") || has("warmer")) return "Jacket";
  if (has("hoodie")) return "Hoodie";
  if (has("pinnie")) return "Pinnie";
  if (has("cap")) return "Cap";
  if (has("socks")) return "Socks";
  if (has("tee") || has("dri-fit")) return "Dri-fit shirt";
  return name;
}

// ---------------------------------------------------------------------------
// Checking a draft before it's sent (the database checks again)
// ---------------------------------------------------------------------------

export type DraftErrors = Partial<Record<"description" | "neededBy" | "team" | "garments" | `garment:${string}`, string>>;

export function manilaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

export function checkDetails(d: RequestDraft): DraftErrors {
  const e: DraftErrors = {};
  if (d.description.trim().length < 3) e.description = "Say what the order is for, like “Liga uniforms for the barangay tournament”.";
  else if (d.description.trim().length > 500) e.description = "Keep this under 500 characters.";
  if (d.team.trim().length > 80) e.team = "Keep the team name under 80 characters.";
  if (d.neededBy && d.neededBy < manilaToday()) e.neededBy = "That date has already passed. Pick a later one, or leave it empty.";
  return e;
}

export function checkGarments(d: RequestDraft): DraftErrors {
  const e: DraftErrors = {};
  if (d.garments.length === 0) e.garments = "Add at least one garment.";
  for (const g of d.garments) {
    if (g.garment === OTHER && !g.other.trim()) e[`garment:${g.key}`] = "Type what garment this is.";
    else if (piecesOf(g) === 0) e[`garment:${g.key}`] = "Enter how many pieces you need in at least one size.";
  }
  if (!e.garments && totalPieces(d) > 5000) e.garments = "That’s more than 5,000 pieces. Message the shop for an order that size.";
  return e;
}
