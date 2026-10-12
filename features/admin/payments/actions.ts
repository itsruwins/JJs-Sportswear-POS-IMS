"use server";

import { formatPeso } from "@/features/shared/catalog/catalog";
import { COUNTER_MIGRATION, PAYMENTS_MIGRATION, type RefundMethod } from "./data";
import { cleanReference } from "@/features/shared/payments/model";
import { fetchProviders } from "@/features/shared/payments/data";
import { geminiConfigured, GeminiError, readReceiptImage } from "@/features/admin/pos/gemini";
import { checkReading, concernsOf, type ReceiptField, type ReceiptFields, type ScanConcern } from "@/features/admin/pos/scan";
import { requireStaff } from "@/features/admin/shell/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validId = (id: unknown): id is string => typeof id === "string" && UUID.test(id);
const amountOf = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 && n < 10_000_000 ? Math.round(n * 100) / 100 : null);
const textOf = (s: unknown, max = 300) => (typeof s === "string" ? s.trim().slice(0, max) : "");
const isRefundMethod = (m: unknown): m is RefundMethod => m === "cash" || m === "gcash";
const E_PAYMENTS_MIGRATION = "supabase/migrations/20261019000000_custom_order_e_payments.sql";

export type PayResult = { ok: true; message?: string; id?: string } | { ok: false; message: string; stale?: boolean };

/** Plain sentences for what the database refuses. */
function explain(error: { code?: string; message?: string } | null, fallback: string): PayResult {
  const text = error?.message ?? "";
  if (error?.code === "PGRST202" || error?.code === "PGRST205") return { ok: false, message: `This needs the latest database update (${PAYMENTS_MIGRATION}).` };
  const over = text.match(/more than the ₱([\d.]+) still due/);
  if (over) return { ok: false, message: `That’s more than the ${formatPeso(Number(over[1]))} still due.`, stale: true };
  const refundMax = text.match(/refund can be up to ₱([\d.]+)/);
  if (refundMax) return { ok: false, message: `The refund can be up to ${formatPeso(Number(refundMax[1]))}, what’s left of what they paid.` };
  if (error?.code === "23505") return { ok: false, message: "That reference is already on another payment. Check the number on the screenshot." };
  if (/Only a submitted (GCash|e-payment)/i.test(text)) return { ok: false, message: "Only an e-payment the customer sent, with its reference, can be verified. Reject this one." };
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

/** Staff record money they've received: cash, or an e-payment through a provider. It counts as verified straight away. */
export async function recordPayment(
  orderId: string,
  amount: number,
  method: "cash" | "e_payment",
  provider: string | null,
  reference: string,
  proofPath: string | null,
  note: string,
): Promise<PayResult> {
  const { supabase } = await requireStaff();
  const value = amountOf(amount);
  if (
    !validId(orderId) ||
    (method !== "cash" && method !== "e_payment") ||
    typeof reference !== "string" ||
    (method === "e_payment" && (typeof provider !== "string" || !/^[a-z][a-z0-9_]{1,31}$/.test(provider))) ||
    (proofPath !== null && typeof proofPath !== "string")
  ) {
    return { ok: false, message: "That payment doesn’t look right. Check it and try again." };
  }
  if (value === null) return { ok: false, message: "Enter the amount received." };
  const ref = cleanReference(reference).slice(0, 60);
  if (method === "e_payment" && !ref) return { ok: false, message: "Enter the reference number from the receipt." };
  // Only a fresh upload into this order's folder: {customer}/{order}/{uuid}.ext
  const ownPath = (path: string) => new RegExp(`^[0-9a-f-]{36}/${orderId}/[0-9a-f-]{36}\\.(webp|jpe?g|png)$`, "i").test(path);
  if (proofPath && !ownPath(proofPath)) {
    return { ok: false, message: "The screenshot didn’t upload properly. Try again." };
  }

  const { data, error } = await supabase.rpc("record_custom_order_payment", {
    p_order_id: orderId,
    p_amount: value,
    p_method: method,
    p_provider: method === "e_payment" ? provider : null,
    p_reference: method === "e_payment" ? ref : null,
    p_proof_path: method === "e_payment" ? proofPath : null,
    p_note: textOf(note) || null,
  });
  if (error) {
    // Don't keep a screenshot for a payment that wasn't recorded, unless another payment already uses it.
    if (proofPath) {
      const { count } = await supabase.from("payments").select("id", { count: "exact", head: true }).eq("gcash_screenshot_url", proofPath);
      if (count === 0) await supabase.storage.from("payment-proofs").remove([proofPath]);
    }
    if (error.code === "PGRST202") return { ok: false, message: `Recording e-payments needs the latest database update (${E_PAYMENTS_MIGRATION}).` };
    const taken = (error.details ?? "").match(/^payment:duplicate:(.+)$/);
    if (taken) return { ok: false, message: `That reference was already used at the counter (${taken[1]}). Check the number on the receipt.` };
    if (error.details === "payment:reference") return { ok: false, message: "That reference number doesn’t look right for this provider. Check it against the receipt." };
    if (error.details === "payment:provider") return { ok: false, message: "That bank or e-wallet isn’t accepted anymore. Pick another one." };
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

export async function recordRefund(orderId: string, amount: number, method: RefundMethod, note: string): Promise<PayResult> {
  const { supabase, profile } = await requireStaff();
  if (profile.role !== "owner") return { ok: false, message: "Only the owner can record refunds." };
  const value = amountOf(amount);
  if (!validId(orderId) || !isRefundMethod(method)) return { ok: false, message: "That refund doesn’t look right." };
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

/** Owner: a counter e-payment found in the shop's account, not found or wrong (with a reason), or back to be checked. */
export async function checkCounterPayment(id: string, status: "matched" | "disputed" | "cashier_confirmed", note = ""): Promise<PayResult> {
  const { supabase, profile } = await requireStaff();
  if (profile.role !== "owner") return { ok: false, message: "Only the owner can check counter e-payments." };
  if (!validId(id) || !["matched", "disputed", "cashier_confirmed"].includes(status)) return { ok: false, message: "That payment doesn’t exist." };
  const reason = textOf(note);
  if (status === "disputed" && reason.length < 3) return { ok: false, message: "Say what’s wrong with the payment." };
  const { error } = await supabase.rpc("check_sale_payment", { p_payment_id: id, p_status: status, p_note: reason || null });
  if (error) {
    if (error.code === "PGRST202") return { ok: false, message: `Checking needs the latest database update (${COUNTER_MIGRATION}).` };
    return explain(error, "We couldn’t save that. Try again.");
  }
  return { ok: true, message: status === "matched" ? "Marked as matched." : status === "disputed" ? "Marked as disputed." : "Back on the list to check." };
}

export type ScreenshotReading =
  | { ok: true; fields: ReceiptFields; unsure: ReceiptField[]; concerns: ScanConcern[] }
  | { ok: false; kind: "none" | "unreadable" | "not_receipt" | "quota" | "unavailable" | "file"; message: string };

const IMAGE_TYPES: Record<string, (b: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
};

/**
 * The reader's look at the screenshot a customer sent with a payment, for staff checking it. Read
 * once and kept (receipt_scans.payment_id); `again` reads it fresh. Nothing about the payment changes.
 */
export async function readPaymentScreenshot(paymentId: string, again = false): Promise<ScreenshotReading> {
  const { supabase } = await requireStaff();
  const fail = (kind: Exclude<ScreenshotReading, { ok: true }>["kind"], message: string): ScreenshotReading => ({ ok: false, kind, message });
  if (!validId(paymentId)) return fail("none", "That payment doesn’t exist.");

  const { data: payment } = await supabase.from("payments").select("id, provider, gcash_screenshot_url").eq("id", paymentId).maybeSingle();
  const pay = payment as { id: string; provider: string | null; gcash_screenshot_url: string | null } | null;
  if (!pay?.gcash_screenshot_url) return fail("none", "There’s no screenshot with this payment.");

  type Kept = { outcome: string; reading: { fields?: ReceiptFields; unsure?: ReceiptField[]; problems?: string[] } | null };
  if (!again) {
    const { data: kept } = await supabase
      .from("receipt_scans")
      .select("outcome, reading")
      .eq("payment_id", paymentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const k = kept as Kept | null;
    if (k?.outcome === "read" && k.reading?.fields) {
      return { ok: true, fields: k.reading.fields, unsure: k.reading.unsure ?? [], concerns: concernsOf(k.reading.problems ?? []) };
    }
  }
  if (!geminiConfigured()) return fail("unavailable", "The receipt reader isn’t connected.");

  const { data: file, error: downloadError } = await supabase.storage.from("payment-proofs").download(pay.gcash_screenshot_url);
  if (downloadError || !file) return fail("file", "The screenshot couldn’t be opened.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = Object.keys(IMAGE_TYPES).find((t) => IMAGE_TYPES[t](bytes));
  if (!type || bytes.length > 4 * 1024 * 1024) return fail("file", "The screenshot isn’t a photo the reader can use.");

  const { providers } = await fetchProviders(supabase);
  const active = providers.filter((p) => p.isActive);
  const picked = active.find((p) => p.code === pay.provider)?.name ?? "GCash";
  const started = Date.now();
  let result: ScreenshotReading;
  let outcome: "read" | "not_receipt" | "unreadable" | "quota" | "failed";
  let model: string | null = null;
  let reading: Record<string, unknown> | null = null;
  try {
    const answer = await readReceiptImage({ bytes, type }, { picked, providers: active });
    model = answer.model;
    const checked = checkReading(answer.raw, active);
    if (checked.ok) {
      outcome = "read";
      reading = { fields: checked.fields, unsure: checked.unsure, problems: checked.problems, confidence: checked.confidence };
      result = { ok: true, fields: checked.fields, unsure: checked.unsure, concerns: checked.concerns };
    } else {
      outcome = checked.kind;
      reading = { problems: checked.problems };
      result = fail(checked.kind, checked.kind === "not_receipt" ? "This doesn’t look like a payment receipt." : "The reader couldn’t make out this screenshot.");
    }
  } catch (e) {
    const kind = e instanceof GeminiError ? e.kind : "failed";
    outcome = kind === "quota" ? "quota" : "failed";
    console.error(kind === "key" ? "readPaymentScreenshot: Google refused GEMINI_API_KEY (deleted, disabled, or mistyped); put a working key in the environment" : `readPaymentScreenshot: reader ${kind}`);
    result = kind === "quota" ? fail("quota", "The reader has reached its limit for now.") : fail("unavailable", "The reader isn’t available right now.");
  }
  const { error: logError } = await supabase.from("receipt_scans").insert({
    provider: pay.provider ?? "gcash",
    outcome,
    model,
    reading,
    duration_ms: Date.now() - started,
    payment_id: paymentId,
  });
  if (logError) console.error(`readPaymentScreenshot: log failed (${logError.code})`);
  return result;
}

export type AccountInput = { acceptsOnline: boolean; accountName: string; accountNumber: string; qrPath: string | null };

/** Owner: where customers send custom-order payments through a provider, and whether it takes them online. */
export async function updateProviderAccount(code: string, input: AccountInput): Promise<PayResult> {
  const { supabase, profile } = await requireStaff();
  if (profile.role !== "owner") return { ok: false, message: "Only the owner can change the shop’s accounts." };
  if (typeof code !== "string" || !/^[a-z][a-z0-9_]{1,31}$/.test(code) || !input || typeof input.acceptsOnline !== "boolean") {
    return { ok: false, message: "That account doesn’t look right." };
  }
  const name = textOf(input.accountName, 80);
  const number = textOf(input.accountNumber, 40);
  const qr = input.qrPath;
  if (qr !== null && (typeof qr !== "string" || !new RegExp(`^${code}/[0-9a-f-]{36}\\.(png|jpg|webp)$`).test(qr))) {
    return { ok: false, message: "The QR image didn’t upload properly. Try again." };
  }
  if (input.acceptsOnline && (!name || !number)) return { ok: false, message: "Add the account name and number before taking payments online." };

  const { data: before } = await supabase.from("payment_providers").select("qr_path").eq("code", code).maybeSingle();
  const { data, error } = await supabase
    .from("payment_providers")
    .update({ accepts_online: input.acceptsOnline, account_name: name || null, account_number: number || null, qr_path: qr })
    .eq("code", code)
    .select("code");
  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") return { ok: false, message: `Shop accounts need the latest database update (${E_PAYMENTS_MIGRATION}).` };
    return { ok: false, message: "We couldn’t save that. Try again." };
  }
  if (!data?.length) return { ok: false, message: "That provider doesn’t exist anymore." };
  // A replaced or removed QR image goes too.
  const old = (before as { qr_path: string | null } | null)?.qr_path;
  if (old && old !== qr) await supabase.storage.from("shop-accounts").remove([old]);
  return { ok: true, message: "Saved." };
}
