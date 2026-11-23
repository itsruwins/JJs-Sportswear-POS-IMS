import type { OrderMoneyLine, OrderTotals, ProviderTotal, SaleSummary, SalesTotals } from "@/features/admin/sales/data";

/** What the Sales list shows: everything, shelf sales only, or custom-order money only. */
export type SalesKind = "all" | "shelf" | "orders";

export const SALES_KINDS: { id: SalesKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "shelf", label: "Shelf" },
  { id: "orders", label: "Orders" },
];

export function parseSalesKind(v: string | string[] | undefined): SalesKind {
  const one = Array.isArray(v) ? v[0] : v;
  return one === "shelf" || one === "orders" ? one : "all";
}

export type TimelineEntry = { kind: "sale"; at: string; sale: SaleSummary } | { kind: "order"; at: string; line: OrderMoneyLine };

/**
 * Sales and order money as one list, newest first. When either source stopped at its cap, the
 * list stops where it did too, so an older entry from the other source never shows past a gap.
 */
export function mergeTimeline(sales: SaleSummary[], salesMore: boolean, lines: OrderMoneyLine[], linesMore: boolean, limit = 300) {
  const cutoffs: number[] = [];
  if (salesMore && sales.length) cutoffs.push(Date.parse(sales[sales.length - 1].created_at));
  if (linesMore && lines.length) cutoffs.push(Date.parse(lines[lines.length - 1].at));
  const floor = Math.max(-Infinity, ...cutoffs);
  const all: TimelineEntry[] = [
    ...sales.map((sale) => ({ kind: "sale" as const, at: sale.created_at, sale })),
    ...lines.map((line) => ({ kind: "order" as const, at: line.at, line })),
  ]
    .filter((e) => Date.parse(e.at) >= floor)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return { entries: all.slice(0, limit), more: salesMore || linesMore || all.length > limit };
}

/** Shelf sales and order money added up: what came in over the period, less refunds. */
export function combineTotals(shelf: SalesTotals | null, orders: OrderTotals | null) {
  const round = (n: number) => Math.round(n * 100) / 100;
  const byProvider = new Map<string, ProviderTotal>();
  for (const p of [...(shelf?.providers ?? []), ...(orders?.providers ?? [])]) {
    const t = byProvider.get(p.code) ?? { ...p, amount: 0 };
    t.amount += p.amount;
    byProvider.set(p.code, t);
  }
  return {
    total: round((shelf?.total ?? 0) + (orders ? orders.paid - orders.refunded : 0)),
    cash: round((shelf?.cash ?? 0) + (orders?.cash ?? 0)),
    e_payment: round((shelf?.e_payment ?? 0) + (orders?.e_payment ?? 0)),
    providers: [...byProvider.values()]
      .map((p) => ({ ...p, amount: round(p.amount) }))
      .filter((p) => p.amount !== 0)
      .sort((a, b) => b.amount - a.amount),
  };
}
