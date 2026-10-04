import type { NextRequest } from "next/server";
import { csvResponse } from "@/lib/admin/csv";
import { fetchHistoryForExport, historyBounds, manilaToday, parseHistoryFilters } from "@/lib/admin/history";
import { fetchMovements, fetchStockRows, needsRestock, STATE_LABEL } from "@/lib/admin/inventory";
import { fetchSalesReport } from "@/lib/admin/sales-report";
import { requireStaff } from "@/lib/admin/session";

const SALES_KINDS = ["sales-summary", "sales-series", "sales-products", "sales-variants", "sales-cashiers"];

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

  if (kind && SALES_KINDS.includes(kind)) {
    const { report, error } = await fetchSalesReport(supabase, filters);
    if (error || !report) {
      return new Response(error ?? "We couldn’t build that report just now. Try again.", { status: /owner/i.test(error ?? "") ? 403 : 500 });
    }
    const t = report.totals;
    // Shares as whole percents, the same rounding as the screen.
    const share = (part: number) => (t.revenue > 0 ? Math.round((part / t.revenue) * 100) : 0);
    const p = report.previous;
    const file = (name: string) => `jj-sales-${name}-${period}.csv`;
    if (kind === "sales-summary") {
      const rows: (string | number)[][] = [["Figure", "This period", ...(p ? ["Period before"] : [])]];
      const add = (label: string, now: number, before?: number) => rows.push([label, now, ...(p ? [before ?? 0] : [])]);
      add("Sales total (PHP)", t.revenue, p?.revenue);
      add("Sales", t.sales, p?.sales);
      add("Average sale (PHP)", t.sales ? Math.round((t.revenue / t.sales) * 100) / 100 : 0, p?.sales ? Math.round((p.revenue / p.sales) * 100) / 100 : 0);
      add("Pieces sold", t.pieces, p?.pieces);
      add("Cash (PHP)", t.cash, p?.cash);
      add("GCash (PHP)", t.gcash, p?.gcash);
      add("Voided sales (not counted)", t.voided, p?.voided);
      add("Voided total (PHP, not counted)", t.voided_revenue, p?.voided_revenue);
      return csvResponse(file("summary"), rows);
    }
    if (kind === "sales-series") {
      const head = report.bucket === "hour" ? "Hour" : report.bucket === "day" ? "Date" : "Month";
      return csvResponse(file(`by-${report.bucket}`), [[head, "Sales", "Total (PHP)"], ...report.series.map((s) => [report.bucket === "hour" ? s.label : s.bucket, s.sales, s.revenue])]);
    }
    if (kind === "sales-products") {
      return csvResponse(file("best-products"), [
        ["Rank", "Product", "Pieces", "Total (PHP)", "Share (%)"],
        ...report.products.map((x, i) => [i + 1, x.name, x.pieces, x.revenue, share(x.revenue)]),
      ]);
    }
    if (kind === "sales-variants") {
      return csvResponse(file("best-sizes-colors"), [
        ["Rank", "Product", "Size", "Color", "Pieces", "Total (PHP)"],
        ...report.variants.map((x, i) => [i + 1, x.name, x.size, x.color, x.pieces, x.revenue]),
      ]);
    }
    if (kind === "sales-cashiers") {
      return csvResponse(file("by-cashier"), [
        ["Cashier", "Username", "Sales", "Average (PHP)", "Total (PHP)", "Share (%)"],
        ...report.cashiers.map((c) => [
          c.full_name?.trim() || "",
          c.username,
          c.sales,
          Math.round((c.revenue / c.sales) * 100) / 100,
          c.revenue,
          share(c.revenue),
        ]),
      ]);
    }
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
