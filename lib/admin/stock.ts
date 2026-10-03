import type { SupabaseClient } from "@supabase/supabase-js";

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
