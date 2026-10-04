import type { NextRequest } from "next/server";
import { csvResponse } from "@/lib/admin/csv";
import { fetchHistoryForExport, historyBounds, manilaToday, parseHistoryFilters } from "@/lib/admin/history";
import { fetchMovements, fetchStockRows, needsRestock, STATE_LABEL } from "@/lib/admin/inventory";
import { requireStaff } from "@/lib/admin/session";

const TYPE_LABEL: Record<string, string> = {
  restock: "Restock",
  return: "Return",
  damage: "Damage",
  adjustment: "Recount",
  sale: "Sale",
};

const stamp = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const manilaTime = (iso: string) => stamp.format(new Date(iso)).replace(",", "");

/** The inventory report's CSV downloads. Owner only, like the Reports page. */
export async function GET(request: NextRequest) {
  const { supabase, profile } = await requireStaff();
  if (profile.role !== "owner") return new Response("Only the owner can download reports.", { status: 403 });

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const kind = params.kind;
  const today = manilaToday();
  const fail = () => new Response("We couldn’t build that report just now. Try again.", { status: 500 });

  if (kind === "stock" || kind === "restock") {
    const { rows, error } = await fetchStockRows(supabase);
    if (error) return fail();
    const list = kind === "stock" ? rows : needsRestock(rows);
    return csvResponse(`jj-${kind === "stock" ? "stock-on-hand" : "needs-restock"}-${today}.csv`, [
      ["Product", "SKU", "Size", "Color", "Price (PHP)", "Stock", "Alert at", "Status", "Value (PHP)"],
      ...list.map((r) => [r.productName, r.sku, r.size, r.color, r.price, r.stock, r.threshold, STATE_LABEL[r.state], r.value]),
    ]);
  }

  // The period-based reports share the History page's range filters.
  const filters = parseHistoryFilters(params, "30d");
  const period = filters.from ? `${filters.from}-to-${filters.to}` : `to-${filters.to}`;

  if (kind === "movement") {
    const { fromIso, toIso } = historyBounds(filters);
    const { movements, total, error, truncated } = await fetchMovements(supabase, fromIso, toIso);
    if (error) return fail();
    // Pieces out are negative so each row adds across to the net change.
    const line = (m: typeof total) => [m.productName, m.restocked, m.returned, -m.damaged, m.recounted, -m.sold, m.net, m.changes];
    return csvResponse(`jj-stock-movement-${period}.csv`, [
      ["Product", "Restocked", "Returned", "Damaged", "Recount +/-", "Sold", "Net change", "Entries"],
      ...movements.map(line),
      line({ ...total, productName: "Total" }),
      ...(truncated ? [["Stopped at 50,000 changes. Pick a shorter period for complete totals."]] : []),
    ]);
  }

  if (kind === "history") {
    const { moves, error, truncated } = await fetchHistoryForExport(supabase, filters);
    if (error) return fail();
    return csvResponse(`jj-stock-history-${period}.csv`, [
      ["Date and time (Manila)", "Product", "SKU", "Size", "Color", "Change", "Quantity", "Before", "After", "Reason", "By"],
      ...moves.map((m) => [
        manilaTime(m.created_at),
        m.variant?.product?.name ?? "Removed product",
        m.sku,
        m.variant?.size,
        m.variant?.color,
        TYPE_LABEL[m.transaction_type] ?? m.transaction_type,
        m.quantity,
        m.previous_stock,
        m.new_stock,
        m.reason,
        m.actor?.full_name?.trim() || (m.actor ? `@${m.actor.username}` : ""),
      ]),
      ...(truncated ? [["Stopped at 50,000 changes. Pick a shorter period or narrower filters for the rest."]] : []),
    ]);
  }

  return new Response("Unknown report.", { status: 400 });
}
