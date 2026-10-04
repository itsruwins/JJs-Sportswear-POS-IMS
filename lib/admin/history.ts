import type { SupabaseClient } from "@supabase/supabase-js";
import type { StockMove } from "./catalog";

export type HistoryRange = "today" | "7d" | "30d" | "all" | "custom";
export type HistoryType = "all" | "restock" | "return" | "damage" | "adjustment" | "sale";

export type HistoryFilters = {
  range: HistoryRange;
  from: string; // YYYY-MM-DD (custom)
  to: string; // YYYY-MM-DD (custom)
  type: HistoryType;
  product: string; // product id or ""
  staff: string; // profile id or ""
  show: number;
};

export const HISTORY_STEP = 50;
export const MAX_SHOW = 500;
const SUM_PAGE = 1000;
const TZ = "Asia/Manila";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** A real calendar date (rejects 2026-13-40 and 2026-02-31, which pass the shape check). */
const isDate = (s: string) => DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
const TYPES: HistoryType[] = ["all", "restock", "return", "damage", "adjustment", "sale"];
const RANGES: HistoryRange[] = ["today", "7d", "30d", "all", "custom"];

/** Today's date in Manila as YYYY-MM-DD. */
export function manilaToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Moves a YYYY-MM-DD date by whole days. */
export function shiftDate(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Reads and cleans the URL's filters; anything unrecognised falls back to the default view (last 7 days). */
export function parseHistoryFilters(params: Record<string, string | string[] | undefined>): HistoryFilters {
  const one = (k: string) => {
    const v = params[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const today = manilaToday();
  let range = (RANGES.includes(one("range") as HistoryRange) ? one("range") : "7d") as HistoryRange;
  let from = isDate(one("from")) ? one("from") : shiftDate(today, -6);
  let to = isDate(one("to")) ? one("to") : today;
  if (range === "custom" && from > to) [from, to] = [to, from];
  if (range !== "custom") {
    to = today;
    from = range === "today" ? today : range === "all" ? "" : shiftDate(today, range === "7d" ? -6 : -29);
  }
  if (range === "custom" && !isDate(one("from")) && !isDate(one("to"))) range = "7d";
  const show = Math.min(MAX_SHOW, Math.max(HISTORY_STEP, Math.round(Number(one("show")) / HISTORY_STEP) * HISTORY_STEP || HISTORY_STEP));
  return {
    range,
    from,
    to,
    type: (TYPES.includes(one("type") as HistoryType) ? one("type") : "all") as HistoryType,
    product: UUID.test(one("product")) ? one("product") : "",
    staff: UUID.test(one("staff")) ? one("staff") : "",
    show,
  };
}

/** Stock changes matching the filters, newest first, plus totals for the whole filtered range. */
export async function fetchHistory(supabase: SupabaseClient, f: HistoryFilters) {
  const fromIso = f.from ? `${f.from}T00:00:00+08:00` : "";
  const toIso = `${shiftDate(f.to, 1)}T00:00:00+08:00`;

  let variantIds: string[] | null = null;
  if (f.product) {
    const { data, error } = await supabase.from("product_variants").select("id").eq("product_id", f.product);
    if (error) return { moves: [] as StockMove[], hasMore: false, total: 0, added: 0, removed: 0, error };
    variantIds = (data ?? []).map((v) => v.id as string);
    if (variantIds.length === 0) return { moves: [] as StockMove[], hasMore: false, total: 0, added: 0, removed: 0, error: null };
  }

  let rowsQuery = supabase
    .from("inventory_transactions")
    .select(
      "id, transaction_type, quantity, previous_stock, new_stock, reason, created_at, variant:product_variants (size, color, product:products (id, name)), actor:profiles (username, full_name)",
      { count: "exact" },
    )
    .lt("created_at", toIso);
  if (fromIso) rowsQuery = rowsQuery.gte("created_at", fromIso);
  const sumsPage = (start: number) => {
    let q = supabase.from("inventory_transactions").select("quantity").lt("created_at", toIso);
    if (fromIso) q = q.gte("created_at", fromIso);
    if (f.type !== "all") q = q.eq("transaction_type", f.type);
    if (f.staff) q = q.eq("created_by", f.staff);
    if (variantIds) q = q.in("variant_id", variantIds);
    return q.order("id").range(start, start + SUM_PAGE - 1);
  };
  if (f.type !== "all") rowsQuery = rowsQuery.eq("transaction_type", f.type);
  if (f.staff) rowsQuery = rowsQuery.eq("created_by", f.staff);
  if (variantIds) rowsQuery = rowsQuery.in("variant_id", variantIds);

  // The API returns at most 1,000 rows per request, so the in/out totals read the range page by page.
  const sumAll = async () => {
    const qty: number[] = [];
    for (let start = 0; start < SUM_PAGE * 50; start += SUM_PAGE) {
      const { data, error } = await sumsPage(start);
      if (error) return { qty, error };
      qty.push(...data.map((r) => r.quantity as number));
      if (data.length < SUM_PAGE) break;
    }
    return { qty, error: null };
  };

  const [rows, sums] = await Promise.all([rowsQuery.order("created_at", { ascending: false }).limit(f.show + 1), sumAll()]);

  const list = (rows.data ?? []) as unknown as StockMove[];
  const qty = sums.qty;
  return {
    moves: list.slice(0, f.show),
    hasMore: list.length > f.show,
    total: rows.count ?? list.length,
    added: qty.filter((q) => q > 0).reduce((a, b) => a + b, 0),
    removed: -qty.filter((q) => q < 0).reduce((a, b) => a + b, 0),
    error: rows.error ?? sums.error,
  };
}

/** Products and staff to offer in the filters. */
export async function fetchHistoryOptions(supabase: SupabaseClient) {
  const [products, staff] = await Promise.all([
    supabase.from("products").select("id, name").order("name"),
    supabase.from("profiles").select("id, username, full_name").in("role", ["staff", "owner"]).order("full_name"),
  ]);
  return {
    products: (products.data ?? []) as { id: string; name: string }[],
    staff: (staff.data ?? []).map((s) => ({
      id: s.id as string,
      name: ((s.full_name as string | null)?.trim() || `@${s.username}`) as string,
    })),
  };
}
