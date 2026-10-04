"use server";

import { requireStaff } from "@/lib/admin/session";
import { MAX_AMOUNT, STOCK_ACTIONS, stockReason, type StockAction } from "@/lib/admin/stock-types";

export type StockEntry = { variantId: string; amount: number };

export type EntryResult = { variantId: string; ok: boolean; message?: string; newStock?: number; skipped?: boolean };

export type StockResult =
  | { ok: true; results: EntryResult[] }
  | { ok: false; message: string; results: EntryResult[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ENTRIES = 200;
const CONCURRENCY = 6;

function rpcMessage(error: { code?: string; message?: string }) {
  if (error.code === "P0001") {
    const m = error.message?.match(/(\d+) available/);
    return m ? `Only ${m[1]} left, so that many can’t be removed.` : "There isn’t enough stock for that.";
  }
  if (error.code === "P0002") return "This size and color doesn’t exist anymore.";
  if (error.code === "42501") return "Your account isn’t allowed to change stock.";
  return "This change didn’t save. Try again.";
}

/**
 * Applies one kind of stock change to several sizes/colors. Each change goes through the
 * database's adjust_stock, which locks the row, refuses to go below zero, and logs it.
 * Changes are independent: one failing (e.g. not enough stock) doesn't undo the others.
 */
export async function adjustStock(
  action: StockAction,
  entries: StockEntry[],
  reasonPick: string,
  note: string,
): Promise<StockResult> {
  const { supabase } = await requireStaff();
  const info = STOCK_ACTIONS.find((a) => a.id === action);
  if (!info) return { ok: false, message: "Choose what kind of change this is.", results: [] };
  if (!info.reasons.includes(reasonPick)) return { ok: false, message: "Pick a reason for this change.", results: [] };

  const raw = Array.isArray(entries) ? entries : [];
  if (raw.length > MAX_ENTRIES) return { ok: false, message: `Save up to ${MAX_ENTRIES} sizes and colors at a time.`, results: [] };
  const list = raw.map((e) => ({ variantId: String(e?.variantId ?? ""), amount: Number(e?.amount) }));
  if (list.length === 0) return { ok: false, message: "Enter at least one amount.", results: [] };
  if (list.some((e) => !UUID.test(e.variantId) || !Number.isInteger(e.amount) || e.amount < 0 || e.amount > MAX_AMOUNT)) {
    return { ok: false, message: "Amounts must be whole numbers.", results: [] };
  }
  if (new Set(list.map((e) => e.variantId)).size !== list.length) {
    return { ok: false, message: "Each size and color can only appear once.", results: [] };
  }
  if (action !== "recount" && list.some((e) => e.amount === 0)) {
    return { ok: false, message: "Amounts must be more than zero.", results: [] };
  }

  const reason = stockReason(reasonPick, String(note ?? ""));

  const applyOne = async (e: { variantId: string; amount: number }): Promise<EntryResult> => {
    let quantity = e.amount;
    if (action === "recount") {
      // Read the recorded count right before writing, so the stored difference is as fresh as possible.
      const { data, error } = await supabase.from("product_variants").select("stock_quantity").eq("id", e.variantId).maybeSingle();
      if (error) return { variantId: e.variantId, ok: false, message: "We couldn’t read the current count. Try again." };
      if (!data) return { variantId: e.variantId, ok: false, message: "This size and color doesn’t exist anymore." };
      quantity = e.amount - (data.stock_quantity as number);
      if (quantity === 0) return { variantId: e.variantId, ok: true, skipped: true, newStock: e.amount };
    }
    const { data, error } = await supabase.rpc("adjust_stock", {
      p_variant_id: e.variantId,
      p_transaction_type: info.dbType,
      p_quantity: quantity,
      p_reason: reason,
    });
    if (error) return { variantId: e.variantId, ok: false, message: rpcMessage(error) };
    return { variantId: e.variantId, ok: true, newStock: (data as { new_stock?: number } | null)?.new_stock };
  };

  // A few at a time keeps big deliveries quick without flooding the database.
  const results: EntryResult[] = new Array(list.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, list.length) }, async () => {
      while (next < list.length) {
        const i = next++;
        // One unexpected failure must not end the batch early while other changes keep writing.
        try {
          results[i] = await applyOne(list[i]);
        } catch {
          results[i] = { variantId: list[i].variantId, ok: false, message: "This change didn’t save. Try again." };
        }
      }
    }),
  );

  const failed = results.filter((r) => !r.ok).length;
  if (failed === 0) return { ok: true, results };
  const saved = results.filter((r) => r.ok && !r.skipped).length;
  return {
    ok: false,
    message: saved
      ? `${saved} saved, ${failed} didn’t. Those are marked below.`
      : failed === 1
        ? "That change didn’t save. See below."
        : "None of these changes saved. See below.",
    results,
  };
}
