import type { SupabaseClient } from "@supabase/supabase-js";
import { sortColors, sortSizes, variantState, type StockState } from "@/features/shared/catalog/catalog";

// Reads page after the last id seen until a page comes back empty: correct whatever the API's
// per-response cap is, and rows added mid-read can't shift a page and be counted twice.
const PAGE = 1000;
const MAX_PAGES = 50;

export type StockRow = {
  id: string;
  productId: string;
  productName: string;
  size: string | null;
  color: string | null;
  sku: string | null;
  price: number;
  stock: number;
  threshold: number;
  state: StockState;
  value: number;
};

/**
 * Every size and color on sale (active variants of active products), with its stock and its
 * value at the selling price. Archived products, hidden sizes, and made-to-order products
 * (which keep no stock) are left out, as on Home.
 */
export async function fetchStockRows(supabase: SupabaseClient) {
  const rows: StockRow[] = [];
  let afterId = "";
  // Before migration 20261021000000_made_to_order.sql there's no made_to_order column to filter on.
  let hasMadeToOrder = true;
  for (let i = 0; i < MAX_PAGES; i++) {
    let q = supabase
      .from("product_variants")
      .select("id, product_id, size, color, sku, price, stock_quantity, low_stock_threshold, product:products!inner(name)")
      .eq("is_active", true)
      .eq("products.is_active", true);
    if (hasMadeToOrder) q = q.eq("products.made_to_order", false);
    if (afterId) q = q.gt("id", afterId);
    const { data, error } = await q
      .order("id")
      .limit(PAGE)
      .returns<
        {
          id: string;
          product_id: string;
          size: string | null;
          color: string | null;
          sku: string | null;
          price: number | string;
          stock_quantity: number;
          low_stock_threshold: number;
          product: { name: string } | null;
        }[]
      >();
    if (error?.code === "42703" && hasMadeToOrder && rows.length === 0) {
      hasMadeToOrder = false;
      i--;
      continue;
    }
    if (error) return { rows, error };
    if (data.length === 0) break;
    afterId = data[data.length - 1].id;
    for (const v of data) {
      const price = Number(v.price);
      rows.push({
        id: v.id,
        productId: v.product_id,
        productName: v.product?.name ?? "Unnamed product",
        size: v.size,
        color: v.color,
        sku: v.sku,
        price,
        stock: v.stock_quantity,
        threshold: v.low_stock_threshold,
        state: variantState(v),
        value: Math.round(price * v.stock_quantity * 100) / 100,
      });
    }
  }
  return { rows: sortStockRows(rows), error: null };
}

/** Product name, then color, then the standard size order. */
function sortStockRows(rows: StockRow[]) {
  const sizeOrder = sortSizes([...new Set(rows.map((r) => r.size ?? ""))]);
  const colorOrder = sortColors([...new Set(rows.map((r) => r.color ?? ""))]);
  return rows.sort(
    (a, b) =>
      a.productName.localeCompare(b.productName) ||
      a.productId.localeCompare(b.productId) ||
      colorOrder.indexOf(a.color ?? "") - colorOrder.indexOf(b.color ?? "") ||
      sizeOrder.indexOf(a.size ?? "") - sizeOrder.indexOf(b.size ?? ""),
  );
}

export function stockSummary(rows: StockRow[]) {
  return {
    products: new Set(rows.map((r) => r.productId)).size,
    variants: rows.length,
    pieces: rows.reduce((s, r) => s + r.stock, 0),
    value: Math.round(rows.reduce((s, r) => s + r.value, 0) * 100) / 100,
    low: rows.filter((r) => r.state === "low").length,
    out: rows.filter((r) => r.state === "zero").length,
  };
}

/** Sold out first, then the lowest counts. */
export function needsRestock(rows: StockRow[]) {
  return rows
    .filter((r) => r.state !== "in")
    .sort((a, b) => a.stock - b.stock || a.productName.localeCompare(b.productName));
}

export type ProductGroup = { productId: string; productName: string; rows: StockRow[]; pieces: number; value: number };

export function groupByProduct(rows: StockRow[]): ProductGroup[] {
  const groups: ProductGroup[] = [];
  for (const r of rows) {
    let g = groups[groups.length - 1];
    if (g?.productId !== r.productId) {
      g = { productId: r.productId, productName: r.productName, rows: [], pieces: 0, value: 0 };
      groups.push(g);
    }
    g.rows.push(r);
    g.pieces += r.stock;
    g.value = Math.round((g.value + r.value) * 100) / 100;
  }
  return groups;
}

export type Movement = {
  productId: string;
  productName: string;
  /** How many stock changes were logged (recounts can cancel out to a net of zero). */
  changes: number;
  restocked: number;
  returned: number;
  damaged: number;
  recounted: number;
  sold: number;
  net: number;
  /** Every piece added (restocks, returns, upward recounts) and every piece taken out. */
  piecesIn: number;
  piecesOut: number;
};

const blank = (productId: string, productName: string): Movement => ({
  productId,
  productName,
  changes: 0,
  restocked: 0,
  returned: 0,
  damaged: 0,
  recounted: 0,
  sold: 0,
  net: 0,
  piecesIn: 0,
  piecesOut: 0,
});

/**
 * Stock movement per product between two timestamps (fromIso may be empty for "since the
 * start"). Damage and sales are reported as positive pieces out; recounts keep their sign.
 */
export async function fetchMovements(supabase: SupabaseClient, fromIso: string, toIso: string) {
  const byProduct = new Map<string, Movement>();
  const total = blank("", "All products");
  let truncated = true;
  let afterId = "";
  for (let i = 0; i < MAX_PAGES; i++) {
    let q = supabase
      .from("inventory_transactions")
      .select("id, transaction_type, quantity, reason, variant:product_variants (product_id, product:products (name))")
      .lt("created_at", toIso);
    if (fromIso) q = q.gte("created_at", fromIso);
    if (afterId) q = q.gt("id", afterId);
    const { data, error } = await q
      .order("id")
      .limit(PAGE)
      .returns<
        {
          id: string;
          transaction_type: string;
          quantity: number;
          reason: string | null;
          variant: { product_id: string; product: { name: string } | null } | null;
        }[]
      >();
    if (error) return { movements: [], total, error, truncated: false };
    if (data.length === 0) {
      truncated = false;
      break;
    }
    afterId = data[data.length - 1].id;
    for (const t of data) {
      const id = t.variant?.product_id ?? "";
      let m = byProduct.get(id);
      if (!m) byProduct.set(id, (m = blank(id, t.variant?.product?.name ?? "Removed product")));
      // A voided sale's stock comes back logged as a return ("Voided sale RCPT-…"); it undoes the
      // sale, so it counts against Sold rather than as a customer return.
      const voidedSale = t.transaction_type === "return" && (t.reason ?? "").startsWith("Voided sale ");
      for (const target of [m, total]) {
        if (t.transaction_type === "restock") target.restocked += t.quantity;
        else if (voidedSale) target.sold -= t.quantity;
        else if (t.transaction_type === "return") target.returned += t.quantity;
        else if (t.transaction_type === "damage") target.damaged -= t.quantity;
        else if (t.transaction_type === "adjustment") target.recounted += t.quantity;
        else if (t.transaction_type === "sale") target.sold -= t.quantity;
        target.net += t.quantity;
        target.changes += 1;
        if (t.quantity > 0) target.piecesIn += t.quantity;
        else target.piecesOut -= t.quantity;
      }
    }
  }
  const movements = [...byProduct.values()].sort((a, b) => a.productName.localeCompare(b.productName));
  return { movements, total, error: null, truncated };
}

/** "Free size · Black", or an empty string when a variant has neither. */
export function variantLabel(r: Pick<StockRow, "size" | "color">) {
  return [r.size, r.color].filter(Boolean).join(" · ");
}

export const STATE_LABEL: Record<StockState, string> = { in: "In stock", low: "Low", zero: "Sold out" };

/** Whether any of these variants has a stock movement or sale on record (so the product must be archived, not deleted). */
export async function hasStockHistory(supabase: SupabaseClient, variantIds: string[]) {
  if (variantIds.length === 0) return false;
  const [history, sales] = await Promise.all([
    supabase.from("inventory_transactions").select("id", { count: "exact", head: true }).in("variant_id", variantIds),
    supabase.from("sale_items").select("id", { count: "exact", head: true }).in("variant_id", variantIds),
  ]);
  if (history.error || sales.error) throw new Error("Stock history check failed");
  return (history.count ?? 0) > 0 || (sales.count ?? 0) > 0;
}
