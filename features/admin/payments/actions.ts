"use server";

import { formatPeso } from "@/features/shared/catalog/catalog";
import { PAYMENTS_MIGRATION, type PayMethod } from "@/lib/admin/payments";
import { requireStaff } from "@/lib/admin/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validId = (id: unknown): id is string => typeof id === "string" && UUID.test(id);
const amountOf = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 && n < 10_000_000 ? Math.round(n * 100) / 100 : null);
const textOf = (s: unknown, max = 300) => (typeof s === "string" ? s.trim().slice(0, max) : "");
const isMethod = (m: unknown): m is PayMethod => m === "cash" || m === "gcash";

export type PayResult = { ok: true; message?: string; id?: string } | { ok: false; message: string; stale?: boolean };

/** Plain sentences for what the database refuses. */
function explain(error: { code?: string; message?: string } | null, fallback: string): PayResult {
  const text = error?.message ?? "";
  if (error?.code === "PGRST202" || error?.code === "PGRST205") return { ok: false, message: `This needs the latest database update (${PAYMENTS_MIGRATION}).` };
  const over = text.match(/more than the ₱([\d.]+) still due/);
  if (over) return { ok: false, message: `That’s more than the ${formatPeso(Number(over[1]))} still due.`, stale: true };
  const refundMax = text.match(/refund can be up to ₱([\d.]+)/);
  if (refundMax) return { ok: false, message: `The refund can be up to ${formatPeso(Number(refundMax[1]))}, what’s left of what they paid.` };
  if (error?.code === "23505") return { ok: false, message: "That GCash reference is already on another payment. Check the number on the screenshot." };
  if (/Only a submitted GCash payment/i.test(text)) return { ok: false, message: "Only a GCash payment the customer sent, with its reference, can be verified. Reject this one." };
  if (/GCash reference/i.test(text)) return { ok: false, message: "Enter the 13-digit GCash reference number." };
  if (/already (verified|rejected)/i.test(text)) return { ok: false, message: "Someone already reviewed this payment. The page now shows the latest.", stale: true };
  if (/accepted orders until|can't take payments|doesn't apply|Refunds are recorded on cancelled/i.test(text)) {
    return { ok: false, message: "The order moved on since this page loaded. The page now shows the latest.", stale: true };
  }
  if (/isn't in this order's folder/i.test(text)) return { ok: false, message: "The screenshot didn’t upload properly. Try again." };
  if (error?.code === "42501") return { ok: false, message: "Your account isn’t allowed to do that." };
  if (error?.code === "P0002") return { ok: false, message: "That doesn’t exist anymore.", stale: true };
  return { ok: false, message: fallback };
}

/** Staff record money they've received; it counts as verified straight away. */
export async function recordPayment(
  orderId: string,
  amount: number,
  method: PayMethod,
  gcashRef: string,
  proofPath: string | null,
  note: string,
): Promise<PayResult> {
  const { supabase } = await requireStaff();
  const value = amountOf(amount);
  if (!validId(orderId) || !isMethod(method) || typeof gcashRef !== "string" || (proofPath !== null && typeof proofPath !== "string")) {
    return { ok: false, message: "That payment doesn’t look right. Check it and try again." };
  }
  if (value === null) return { ok: false, message: "Enter the amount received." };
  const ref = gcashRef.replace(/\D/g, "");
  if (method === "gcash" && ref.length !== 13) return { ok: false, message: "Enter the 13-digit GCash reference number." };
  // Only a fresh upload into this order's folder: {customer}/{order}/{uuid}.ext
  const ownPath = (path: string) => new RegExp(`^[0-9a-f-]{36}/${orderId}/[0-9a-f-]{36}\\.(webp|jpe?g|png)$`, "i").test(path);
  if (proofPath && !ownPath(proofPath)) {
    return { ok: false, message: "The screenshot didn’t upload properly. Try again." };
  }

  const { data, error } = await supabase.rpc("record_custom_order_payment", {
    p_order_id: orderId,
    p_amount: value,
    p_method: method,
    p_gcash_reference: method === "gcash" ? ref : null,
    p_proof_path: method === "gcash" ? proofPath : null,
    p_note: textOf(note) || null,
  });
  if (error) {
    // Don't keep a screenshot for a payment that wasn't recorded, unless another payment already uses it.
    if (proofPath) {
      const { count } = await supabase.from("payments").select("id", { count: "exact", head: true }).eq("gcash_screenshot_url", proofPath);
      if (count === 0) await supabase.storage.from("payment-proofs").remove([proofPath]);
    }
    const r = explain(error, "We couldn’t record the payment. Nothing was saved; try again.");
    // Too much: keep the form so the amount can be fixed, rather than closing it.
    if (!r.ok && /still due/.test(r.message)) return { ok: false, message: r.message };
    return r;
  }
  return { ok: true, message: `${formatPeso(value)} recorded. The customer has been told.`, id: (data as { id?: string } | null)?.id };
}

export async function verifyPayment(id: string): Promise<PayResult> {
  const { supabase } = await requireStaff();
  if (!validId(id)) return { ok: false, message: "That payment doesn’t exist." };
  const { error } = await supabase.rpc("verify_payment", { p_payment_id: id });
  if (error) return explain(error, "We couldn’t verify the payment. Try again.");
  return { ok: true, message: "Payment verified. The customer has been told." };
}

export async function rejectPayment(id: string, reason: string): Promise<PayResult> {
  const { supabase } = await requireStaff();
  if (!validId(id)) return { ok: false, message: "That payment doesn’t exist." };
  const why = textOf(reason);
  if (why.length < 3) return { ok: false, message: "Tell the customer why the payment was rejected." };
  const { error } = await supabase.rpc("reject_payment", { p_payment_id: id, p_reason: why });
  if (error) return explain(error, "We couldn’t reject the payment. Try again.");
  return { ok: true, message: "Payment rejected. The customer sees your reason." };
}

export async function recordRefund(orderId: string, amount: number, method: PayMethod, note: string): Promise<PayResult> {
  const { supabase, profile } = await requireStaff();
  if (profile.role !== "owner") return { ok: false, message: "Only the owner can record refunds." };
  const value = amountOf(amount);
  if (!validId(orderId) || !isMethod(method)) return { ok: false, message: "That refund doesn’t look right." };
  if (value === null) return { ok: false, message: "Enter the amount given back." };
  const why = textOf(note);
  if (why.length < 3) return { ok: false, message: "Note how the refund was given." };
  const { error } = await supabase.rpc("record_refund", { p_order_id: orderId, p_amount: value, p_method: method, p_note: why });
  if (error) return explain(error, "We couldn’t record the refund. Try again.");
  return { ok: true, message: `Refund of ${formatPeso(value)} recorded.` };
}

export async function overrideRule(orderId: string, kind: "production" | "pickup", reason: string): Promise<PayResult> {
  const { supabase, profile } = await requireStaff();
  if (profile.role !== "owner") return { ok: false, message: "Only the owner can make this exception." };
  if (!validId(orderId) || (kind !== "production" && kind !== "pickup")) return { ok: false, message: "That exception doesn’t exist." };
  const why = textOf(reason);
  if (why.length < 3) return { ok: false, message: "Note why the exception is made." };
  const { error } = await supabase.rpc("override_payment_rule", { p_order_id: orderId, p_kind: kind, p_reason: why });
  if (error) return explain(error, "We couldn’t save the exception. Try again.");
  return {
    ok: true,
    message: kind === "production" ? "Exception saved. Production can start; tick the first step." : "Exception saved. The order can be picked up now.",
  };
}
