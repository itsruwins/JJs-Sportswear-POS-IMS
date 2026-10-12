// The kinds of stock change staff make by hand, and their one-tap reasons.
// (Sales are recorded by the point of sale, not here.)

export type StockAction = "restock" | "return" | "damage" | "recount";

export type StockActionInfo = {
  id: StockAction;
  label: string;
  /** What staff type into each size: an amount to add or remove, or the counted total. */
  prompt: string;
  sign: "+" | "−" | "=";
  /** The inventory_transactions type the database records. */
  dbType: "restock" | "return" | "damage" | "adjustment";
  reasons: string[];
  save: string;
  notePlaceholder: string;
};

export const STOCK_ACTIONS: StockActionInfo[] = [
  {
    id: "restock",
    label: "Restock",
    prompt: "How many came in",
    sign: "+",
    dbType: "restock",
    reasons: ["Supplier delivery", "Finished printing", "Moved from storage"],
    save: "Save restock",
    notePlaceholder: "Optional note, e.g. DR number",
  },
  {
    id: "return",
    label: "Return",
    prompt: "How many came back",
    sign: "+",
    dbType: "return",
    reasons: ["Customer return", "Exchange"],
    save: "Save return",
    notePlaceholder: "Optional note, e.g. order number",
  },
  {
    id: "damage",
    label: "Damage",
    prompt: "How many to remove",
    sign: "−",
    dbType: "damage",
    reasons: ["Misprint", "Torn or stained", "Lost"],
    save: "Remove damaged",
    notePlaceholder: "Optional note, e.g. what’s wrong",
  },
  {
    id: "recount",
    label: "Recount",
    prompt: "What’s on the shelf now",
    sign: "=",
    dbType: "adjustment",
    reasons: ["Shelf count", "Found extra", "Missing items"],
    save: "Save count",
    notePlaceholder: "Optional note, e.g. who counted",
  },
];

export const stockAction = (id: StockAction) => STOCK_ACTIONS.find((a) => a.id === id)!;

export const MAX_NOTE = 160;
export const MAX_AMOUNT = 100_000;

/** The reason stored with the change: the quick pick, plus the note when there is one. */
export function stockReason(pick: string, note: string) {
  const n = note.trim().replace(/\s+/g, " ").slice(0, MAX_NOTE);
  return n ? `${pick}: ${n}` : pick;
}
