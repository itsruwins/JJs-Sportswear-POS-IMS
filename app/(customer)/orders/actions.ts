"use server";

import { revalidatePath } from "next/cache";
import { REQUESTS_MIGRATION } from "@/lib/customer/order-data";
import { formatPeso } from "@/lib/admin/catalog";
import { MAX_REFERENCES, moneyOf, canPay, type MyPayment, type OrderLine, type OrderStatus } from "@/lib/customer/orders";
import { requireCustomer } from "@/lib/customer/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const textOf = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");

export type RequestPayload = {
  team: string;
  description: string;
  neededBy: string;
  notes: string;
  references: string[];
  lines: OrderLine[];
};

export type RequestResult = { ok: true; id: string } | { ok: false; message: string };

/** Plain sentences for what the database refuses. Its own checks are already written for customers. */
function explain(error: { code?: string; message?: string } | null): RequestResult {
  if (error?.code === "PGRST202") {
    return { ok: false, message: `Custom orders need the latest database update (${REQUESTS_MIGRATION}). Ask the shop to run it.` };
  }
  if (error?.code === "22023" || error?.code === "P0001") return { ok: false, message: error.message ?? "Check the order and try again." };
  if (error?.code === "P0002") return { ok: false, message: "That order doesn’t exist anymore." };
  if (error?.code === "42501") return { ok: false, message: error.message?.includes("customer") ? error.message : "Your account can’t do that." };
  return { ok: false, message: "We couldn’t send that just now. Check your connection and try again." };
}

/** Shapes the payload for the request functions; anything malformed is refused before it reaches the database. */
function args(uid: string, p: RequestPayload) {
  const neededBy = typeof p?.neededBy === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.neededBy) ? p.neededBy : null;
  const references = Array.isArray(p?.references)
    ? p.references.filter((r): r is string => typeof r === "string" && r.startsWith(`${uid}/`)).slice(0, MAX_REFERENCES)
    : [];
  const lines = Array.isArray(p?.lines)
    ? p.lines.map((l) => ({
        garment: textOf(l?.garment, 60),
        color: textOf(l?.color, 40) || null,
        size: textOf(l?.size, 20),
        quantity: Number.isInteger(l?.quantity) ? l.quantity : 0,
        notes: textOf(l?.notes, 1000) || null,
      }))
    : [];
  return {
    p_description: textOf(p?.description, 500),
    p_items: lines,
    p_team_name: textOf(p?.team, 80) || null,
    p_needed_by: neededBy,
    p_notes: textOf(p?.notes, 1000) || null,
    p_reference_images: references,
    p_ai_design_id: null,
  };
}

export async function submitRequest(payload: RequestPayload): Promise<RequestResult> {
  const { supabase, profile } = await requireCustomer();
  const { data, error } = await supabase.rpc("submit_custom_order", args(profile.id, payload));
  if (error || !data) return explain(error);
  revalidatePath("/orders");
  return { ok: true, id: (data as { id: string }).id };
}

export async function updateRequest(orderId: string, payload: RequestPayload): Promise<RequestResult> {
  if (typeof orderId !== "string" || !UUID.test(orderId)) return { ok: false, message: "That order doesn’t exist anymore." };
  const { supabase, profile } = await requireCustomer();
  const { error } = await supabase.rpc("update_custom_order", { p_order_id: orderId, ...args(profile.id, payload) });
  if (error) return explain(error);
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true, id: orderId };
}

export async function cancelRequest(orderId: string, reason: string): Promise<RequestResult> {
  if (typeof orderId !== "string" || !UUID.test(orderId)) return { ok: false, message: "That order doesn’t exist anymore." };
  const { supabase } = await requireCustomer();
  const { error } = await supabase.rpc("cancel_custom_order", { p_order_id: orderId, p_reason: textOf(reason, 300) || null });
  if (error) return explain(error);
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true, id: orderId };
}

export type PayResult = { ok: true } | { ok: false; message: string; field?: "amount" | "reference" | "proof" };

/**
 * The customer's GCash payment: amount (up to what's still owed), the 13-digit reference,
 * and the screenshot already uploaded to payment-proofs/{customer}/{order}/. It's saved as
 * "submitted" for the shop to verify; RLS allows only that, and only on accepted orders.
 */
export async function submitPayment(orderId: string, amount: number, reference: string, proofPath: string): Promise<PayResult> {
  if (typeof orderId !== "string" || !UUID.test(orderId)) return { ok: false, message: "That order doesn’t exist anymore." };
  const { supabase, profile } = await requireCustomer();

  const ref = typeof reference === "string" ? reference.replace(/\D/g, "") : "";
  if (ref.length !== 13) return { ok: false, field: "reference", message: "Enter the 13-digit reference number from your GCash receipt." };
  const ownProof = new RegExp(`^${profile.id}/${orderId}/[0-9a-f-]{36}\\.(webp|jpe?g|png)$`, "i");
  if (typeof proofPath !== "string" || !ownProof.test(proofPath)) {
    return { ok: false, field: "proof", message: "Add a screenshot of your GCash receipt." };
  }
  const value = typeof amount === "number" && Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
  if (value <= 0) return { ok: false, field: "amount", message: "Enter how much you sent." };

  // Check against the order as it is now, not as the page last showed it.
  const { data: order } = await supabase
    .from("custom_orders")
    .select("status, total_price, payments (amount, status)")
    .eq("id", orderId)
    .maybeSingle<{ status: OrderStatus; total_price: number | string | null; payments: { amount: number | string; status: MyPayment["status"] }[] | null }>();
  if (!order) return { ok: false, message: "That order doesn’t exist anymore." };
  const money = moneyOf(
    order.total_price === null ? null : Number(order.total_price),
    (order.payments ?? []).map((p) => ({ amount: Number(p.amount), status: p.status })),
  );
  if (!canPay(order.status, money) || !money) {
    return { ok: false, message: "This order isn’t taking payments right now. Refresh the page to see where it is." };
  }
  if (value > money.left) {
    return { ok: false, field: "amount", message: `That’s more than the ${formatPeso(money.left)} still to pay.` };
  }

  const { error } = await supabase.from("payments").insert({
    order_id: orderId,
    payment_type: money.paid + money.waiting < money.down ? "down_payment" : "balance",
    amount: value,
    method: "gcash",
    status: "submitted",
    gcash_reference: ref,
    gcash_screenshot_url: proofPath,
  });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, field: "reference", message: "That reference number is already on another payment. Check the number on your receipt." };
    }
    if (error.code === "42501") return { ok: false, message: "This order isn’t taking payments right now. Refresh the page to see where it is." };
    return { ok: false, message: "We couldn’t send that just now. Check your connection and try again." };
  }
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}
