// Sample content for the landing page. Every order, product, and stock figure here
// is illustrative and is labeled as a sample wherever it renders.

export type Period = "Design" | "Down payment" | "Production" | "Pickup";

export const PERIODS: Period[] = ["Design", "Down payment", "Production", "Pickup"];

export type OrderStage = {
  word: string; // what the board's status cards show
  period: number; // index into PERIODS
  paid: number; // percent of the total paid so far
  stamp: string; // from order_status_history.created_at
  title: string;
  detail: string;
};

export const SAMPLE_ORDER = {
  number: "JJ-0417",
  team: "MAYON BLAZERS",
  readyBy: "OCT 07",
  pieces: 15,
  sizes: [
    { size: "S", qty: 2 },
    { size: "M", qty: 5 },
    { size: "L", qty: 4 },
    { size: "XL", qty: 3 },
    { size: "2XL", qty: 1 },
  ],
};

export const ORDER_STAGES: OrderStage[] = [
  {
    word: "PENDING",
    period: 0,
    paid: 0,
    stamp: "Oct 02 · 09:14",
    title: "Design",
    detail:
      "Describe it to the AI studio, upload your own artwork, or work it out with the shop. List each garment’s color, size, and quantity.",
  },
  {
    word: "ACCEPTED",
    period: 0,
    paid: 0,
    stamp: "Oct 02 · 11:30",
    title: "Review",
    detail:
      "Staff check fabric, ink, and blanks, then accept the order with a final price. If they can’t take it on, they tell you why.",
  },
  {
    word: "50% PAID",
    period: 1,
    paid: 50,
    stamp: "Oct 02 · 14:40",
    title: "Down payment",
    detail:
      "Pay at least half by GCash, with the reference number and a screenshot, or in cash at the shop. Production starts once staff verify it.",
  },
  {
    word: "IN PROGRESS",
    period: 2,
    paid: 50,
    stamp: "Oct 04 · 08:05",
    title: "Production",
    detail:
      "Printed, cut, and sewn. Every piece is inspected, and misprints are reprinted before anything gets packed.",
  },
  {
    word: "READY",
    period: 3,
    paid: 50,
    stamp: "Oct 07 · 16:20",
    title: "Ready",
    detail: "You’re notified with a photo of the finished kit. The balance is due at pickup.",
  },
  {
    word: "COMPLETED",
    period: 3,
    paid: 100,
    stamp: "Oct 08 · 10:00",
    title: "Pickup",
    detail: "Collect at the shop, settle the balance, and the order closes.",
  },
];

export const LOW_STOCK_THRESHOLD = 5;

export type Garment = "jersey" | "tee" | "shorts" | "jacket";

export type SampleProduct = {
  name: string;
  garment: Garment;
  colors: { name: string; swatch: string }[];
  stock: { size: string; qty: number }[];
};

export const SAMPLE_PRODUCTS: SampleProduct[] = [
  {
    name: "Reversible Liga Jersey",
    garment: "jersey",
    colors: [
      { name: "Black", swatch: "oklch(0.2 0.012 50)" },
      { name: "White", swatch: "oklch(0.97 0 0)" },
    ],
    stock: [
      { size: "S", qty: 8 },
      { size: "M", qty: 12 },
      { size: "L", qty: 0 },
      { size: "XL", qty: 11 },
      { size: "2XL", qty: 6 },
    ],
  },
  {
    name: "Dri-fit Practice Tee",
    garment: "tee",
    colors: [
      { name: "J&J orange", swatch: "oklch(0.653 0.215 37.5)" },
      { name: "Heather gray", swatch: "oklch(0.72 0.006 60)" },
    ],
    stock: [
      { size: "S", qty: 14 },
      { size: "M", qty: 9 },
      { size: "L", qty: 16 },
      { size: "XL", qty: 4 },
      { size: "2XL", qty: 7 },
    ],
  },
  {
    name: "Basketball Shorts",
    garment: "shorts",
    colors: [{ name: "Black", swatch: "oklch(0.2 0.012 50)" }],
    stock: [
      { size: "S", qty: 10 },
      { size: "M", qty: 12 },
      { size: "L", qty: 3 },
      { size: "XL", qty: 7 },
      { size: "2XL", qty: 9 },
    ],
  },
  {
    name: "Warmer Jacket",
    garment: "jacket",
    colors: [
      { name: "Charcoal", swatch: "oklch(0.32 0.01 50)" },
      { name: "J&J orange", swatch: "oklch(0.653 0.215 37.5)" },
    ],
    stock: [
      { size: "S", qty: 0 },
      { size: "M", qty: 8 },
      { size: "L", qty: 6 },
      { size: "XL", qty: 2 },
      { size: "2XL", qty: 7 },
    ],
  },
];

export function stockState(qty: number): "in" | "low" | "out" {
  if (qty <= 0) return "out";
  if (qty <= LOW_STOCK_THRESHOLD) return "low";
  return "in";
}
