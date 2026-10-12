"use server";

import { PRODUCTION_MIGRATION, STEPS, type OrderStatus, type Step } from "@/lib/admin/orders";
import { ownerSession } from "@/lib/admin/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STEP_IDS = STEPS.map((s) => s.id);

export type OrderResult = { ok: true; message?: string } | { ok: false; message: string; stale?: boolean };

type DbError = { code?: string; message?: string } | null;

/** Plain sentences for what the database refuses. */
function explain(error: DbError, fallback: string): OrderResult {
  const text = error?.message ?? "";
  if (error?.code === "PGRST202" || error?.code === "PGRST205") {
    return { ok: false, message: `This needs the latest database update (${PRODUCTION_MIGRATION}).` };
  }
  if (/Finish every production step/i.test(text)) return { ok: false, message: "Tick off every production step before marking it ready." };
  const down = text.match(/Record the down payment \(₱([\d.]+)\)/);
  if (down) return { ok: false, message: `Production starts once the down payment (₱${Number(down[1]).toLocaleString("en-PH")}) is paid. Record it under Price and payments.`, stale: true };
  const balance = text.match(/Collect the balance \(₱([\d.]+)\)/);
  if (balance) return { ok: false, message: `Collect the balance (₱${Number(balance[1]).toLocaleString("en-PH")}) before pickup. Record it under Price and payments.`, stale: true };
  const floor = text.match(/less than the ₱([\d.]+) already paid/);
  if (floor) return { ok: false, message: `The price can’t be less than the ₱${Number(floor[1]).toLocaleString("en-PH")} already paid.` };
  if (/can't change once production has started/i.test(text)) {
    return { ok: false, message: "The price is fixed once production starts. The page now shows the latest.", stale: true };
  }
  if (/Set the total price/i.test(text)) return { ok: false, message: "Set the total price before accepting the order." };
  if (/can't go from|can no longer change/i.test(text)) return { ok: false, message: "The order moved on since this page loaded. The page now shows the latest.", stale: true };
  if (/up to 4 finished photos/i.test(text)) return { ok: false, message: "An order can have up to 4 photos. Remove one first." };
  if (/Finish the step before|Undo the later steps/i.test(text)) {
    return { ok: false, message: "Steps go in order. Someone may have just changed one; the page now shows the latest.", stale: true };
  }
  if (/accepted or in production|Only an order in production/i.test(text)) {
    return { ok: false, message: "Production steps change only while the order is accepted or in production.", stale: true };
  }
  if (error?.code === "42501") return { ok: false, message: "Your account isn’t allowed to do that." };
  if (error?.code === "P0002") return { ok: false, message: "That order doesn’t exist anymore.", stale: true };
  return { ok: false, message: fallback };
}

const validId = (id: unknown): id is string => typeof id === "string" && UUID.test(id);

/** Staff see custom orders but don't change them; the owner runs every order. */
const OWNER_ONLY: OrderResult = { ok: false, message: "Only the owner can update custom orders." };
const price = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 && n < 10_000_000 ? Math.round(n * 100) / 100 : null);

/**
 * Moves an order from the status the page showed to the next one. Updating "where status = from"
 * means a change made elsewhere in the meantime is caught rather than overwritten.
 */
async function move(id: string, from: OrderStatus, patch: Record<string, unknown>, fallback: string): Promise<OrderResult> {
  const session = await ownerSession();
  if (!session) return OWNER_ONLY;
  const { supabase } = session;
  if (!validId(id)) return { ok: false, message: "That order doesn’t exist." };
  const { data, error } = await supabase.from("custom_orders").update(patch).eq("id", id).eq("status", from).select("id");
  if (error) return explain(error, fallback);
  if (!data?.length) return { ok: false, message: "The order changed since this page loaded. The page now shows the latest.", stale: true };
  return { ok: true };
}

/** Sets the quoted price while the order is new or accepted (production hasn't started). */
export async function savePrice(id: string, from: OrderStatus, total: number): Promise<OrderResult> {
  const p = price(total);
  if (p === null || p === 0) return { ok: false, message: "Enter the order’s total price." };
  if (from !== "pending" && from !== "accepted") return { ok: false, message: "The price is fixed once production starts." };
  const result = await move(id, from, { total_price: p }, "We couldn’t save the price. Try again.");
  return result.ok ? { ok: true, message: "Price saved." } : result;
}

export async function acceptOrder(id: string, total: number): Promise<OrderResult> {
  const p = price(total);
  if (p === null || p === 0) return { ok: false, message: "Enter the order’s total price to accept it." };
  const result = await move(id, "pending", { total_price: p, status: "accepted" }, "We couldn’t accept the order. Try again.");
  return result.ok ? { ok: true, message: "Order accepted. The customer has been told." } : result;
}

export async function declineOrder(id: string, reason: string): Promise<OrderResult> {
  const why = typeof reason === "string" ? reason.trim().slice(0, 500) : "";
  if (why.length < 3) return { ok: false, message: "Tell the customer why the order is declined." };
  const result = await move(id, "pending", { status: "declined", decline_reason: why }, "We couldn’t decline the order. Try again.");
  return result.ok ? { ok: true, message: "Order declined. The customer has been told why." } : result;
}

export async function markReady(id: string): Promise<OrderResult> {
  const result = await move(id, "in_progress", { status: "ready" }, "We couldn’t mark the order ready. Try again.");
  return result.ok ? { ok: true, message: "Marked ready for pickup. The customer has been told." } : result;
}

/** A ready order goes back to production, with what needs fixing written into its history. */
export async function backToProduction(id: string, reason: string): Promise<OrderResult> {
  const session = await ownerSession();
  if (!session) return OWNER_ONLY;
  const { supabase } = session;
  if (!validId(id)) return { ok: false, message: "That order doesn’t exist." };
  const why = typeof reason === "string" ? reason.trim().slice(0, 300) : "";
  if (why.length < 3) return { ok: false, message: "Say what needs fixing." };
  const { error } = await supabase.rpc("reopen_custom_order", { p_order_id: id, p_reason: why });
  if (error) return explain(error, "We couldn’t move the order back. Try again.");
  return { ok: true, message: "Back in production. The customer has been told it needs a little more work." };
}

export async function completeOrder(id: string): Promise<OrderResult> {
  const result = await move(id, "ready", { status: "completed" }, "We couldn’t complete the order. Try again.");
  return result.ok ? { ok: true, message: "Order completed." } : result;
}

export async function cancelOrder(id: string, reason: string): Promise<OrderResult> {
  const session = await ownerSession();
  if (!session) return OWNER_ONLY;
  const { supabase } = session;
  if (!validId(id)) return { ok: false, message: "That order doesn’t exist." };
  const why = typeof reason === "string" ? reason.trim().slice(0, 500) : "";
  if (why.length < 3) return { ok: false, message: "Say why the order is cancelled." };
  const { error } = await supabase.rpc("cancel_custom_order", { p_order_id: id, p_reason: why });
  if (error) return explain(error, "We couldn’t cancel the order. Try again.");
  return { ok: true, message: "Order cancelled. The customer has been told." };
}

export async function setStep(id: string, step: Step, done: boolean): Promise<OrderResult> {
  const session = await ownerSession();
  if (!session) return OWNER_ONLY;
  const { supabase } = session;
  if (!validId(id) || !STEP_IDS.includes(step) || typeof done !== "boolean") return { ok: false, message: "That step doesn’t exist." };
  const { error } = await supabase.rpc("set_production_step", { p_order_id: id, p_step: step, p_done: done });
  if (error) return explain(error, "We couldn’t update the step. Try again.");
  return { ok: true };
}

export async function reprintOrder(id: string, reason: string): Promise<OrderResult> {
  const session = await ownerSession();
  if (!session) return OWNER_ONLY;
  const { supabase } = session;
  if (!validId(id)) return { ok: false, message: "That order doesn’t exist." };
  const why = typeof reason === "string" ? reason.trim().slice(0, 300) : "";
  if (why.length < 3) return { ok: false, message: "Say what failed inspection." };
  const { error } = await supabase.rpc("reprint_custom_order", { p_order_id: id, p_reason: why });
  if (error) return explain(error, "We couldn’t send the order back for a reprint. Try again.");
  return { ok: true, message: "Sent back to printing. Every step starts over." };
}

const PHOTO_FILE = /^[0-9a-f-]{36}\/[A-Za-z0-9-]+\.(webp|jpe?g|png)$/;

/** Records a photo already uploaded to order-photos/{order id}/… by the browser. */
export async function addPhoto(id: string, path: string): Promise<OrderResult> {
  const session = await ownerSession();
  if (!session) return OWNER_ONLY;
  const { supabase, profile } = session;
  if (!validId(id) || typeof path !== "string" || !PHOTO_FILE.test(path) || !path.startsWith(`${id}/`)) {
    return { ok: false, message: "That photo didn’t upload properly. Try again." };
  }
  const { error } = await supabase.from("custom_order_photos").insert({ order_id: id, path, created_by: profile.id });
  if (error) {
    // A retried save of the same file is already recorded: nothing to undo.
    if (error.code === "23505") return { ok: true };
    // Otherwise don't leave an orphan file behind when the record is refused.
    await supabase.storage.from("order-photos").remove([path]);
    return explain(error, "We couldn’t save the photo. Try again.");
  }
  return { ok: true };
}

export async function removePhoto(id: string, photoId: string): Promise<OrderResult> {
  const session = await ownerSession();
  if (!session) return OWNER_ONLY;
  const { supabase } = session;
  if (!validId(id) || !validId(photoId)) return { ok: false, message: "That photo doesn’t exist." };
  const { data, error } = await supabase.from("custom_order_photos").delete().eq("id", photoId).eq("order_id", id).select("path");
  if (error) return explain(error, "We couldn’t remove the photo. Try again.");
  const path = (data?.[0] as { path?: string } | undefined)?.path;
  if (path) await supabase.storage.from("order-photos").remove([path]);
  return { ok: true };
}
