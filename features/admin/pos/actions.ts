"use server";

import { requireStaff } from "@/features/admin/shell/session";
import { cleanReference, GCASH } from "@/features/shared/payments/model";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The sale function with payment parts arrives with this update (after 20261016000000_e_payment_methods.sql).
const MIGRATION = "supabase/migrations/20261016120000_e_payments.sql";

export type CartItem = { variantId: string; quantity: number };

/** One part of the payment: cash, or an e-payment through a provider with its reference number. */
export type PaymentPart = { method: "cash"; amount: number } | { method: "e_payment"; provider: string; reference: string; amount: number };

/** A refused item points back to its cart line, so the cart can offer the fix. */
export type LineProblem = { variantId?: string; sku?: string; kind: "short"; available: number } | { variantId?: string; sku?: string; kind: "unavailable" };

export type SaleResult = { ok: true; id: string } | { ok: false; message: string; problem?: LineProblem };
export type VoidResult = { ok: true } | { ok: false; message: string };

const amountOk = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n > 0 && n < 10_000_000;

/** Records a counter sale through create_pos_sale; prices, stock, and references are checked by the database. */
export async function createSale(
  items: CartItem[],
  payments: PaymentPart[],
  /** One key per sale from the register; a retried Charge with the same key returns the same sale. */
  requestId: string,
): Promise<SaleResult> {
  const { supabase } = await requireStaff();

  // Server actions take whatever a POST sends, so the shape is checked here too.
  const valid =
    Array.isArray(items) &&
    items.length > 0 &&
    items.length <= 200 &&
    items.every((i) => i && typeof i.variantId === "string" && UUID.test(i.variantId) && Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 9999) &&
    Array.isArray(payments) &&
    payments.length > 0 &&
    payments.length <= 50 &&
    payments.every(
      (p) =>
        p &&
        amountOk(p.amount) &&
        (p.method === "cash" ||
          (p.method === "e_payment" &&
            typeof p.provider === "string" &&
            /^[a-z][a-z0-9_]{1,31}$/.test(p.provider) &&
            typeof p.reference === "string" &&
            p.reference.length <= 80)),
    ) &&
    typeof requestId === "string" &&
    UUID.test(requestId);
  if (!valid) return { ok: false, message: "This sale doesn’t look right. Check the cart and try again." };

  const p_payments = payments.map((p) =>
    p.method === "cash"
      ? { method: "cash" as const, amount: Math.round(p.amount * 100) / 100 }
      : { method: "e_payment" as const, provider: p.provider, reference: cleanReference(p.reference), amount: Math.round(p.amount * 100) / 100 },
  );
  if (p_payments.some((p) => p.method === "e_payment" && !p.reference)) return { ok: false, message: "Enter the reference number from the customer’s receipt." };

  const p_items = items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity }));
  let { data, error } = await supabase.rpc("create_pos_sale", { p_items, p_payments, p_request_id: requestId });
  // Before the update runs, only the cash-or-GCash function exists. A sale paid in one go by cash
  // or GCash still works through it; other providers and split payments wait.
  if (error?.code === "PGRST202") {
    const [only] = p_payments;
    if (p_payments.length !== 1 || (only.method === "e_payment" && only.provider !== GCASH)) {
      return { ok: false, message: `This payment needs the latest database update (${MIGRATION}). Cash and GCash work in the meantime.` };
    }
    ({ data, error } = await supabase.rpc("create_pos_sale", {
      p_items,
      p_amount_paid: only.amount,
      p_payment_method: only.method === "cash" ? "cash" : "gcash",
      p_gcash_reference: only.method === "cash" ? null : only.reference,
      p_request_id: requestId,
    }));
  }

  if (error) {
    const text = error.message ?? "";
    // The updated function names the variant in DETAIL ("variant:<id>:short:<n>"); the original only in
    // the message, by SKU (which may contain spaces) or by id.
    const detail = (error.details ?? "").match(/^variant:([0-9a-f-]{36}):(short|unavailable)(?::(\d+))?$/i);
    const short = text.match(/Insufficient stock for (.+): (\d+) available/);
    const gone = text.match(/Variant (.+?) \(.*\) is not available for sale/);
    const who = (raw: string) => (UUID.test(raw) ? { variantId: raw } : { sku: raw });
    if (detail?.[2] === "short" || short) {
      const id = detail ? { variantId: detail[1] } : who(short![1]);
      const available = Number(detail ? detail[3] : short![2]);
      return {
        ok: false,
        message: available === 0 ? "One item just sold out. Remove it to continue." : `One item has only ${available} left now. Lower it to continue.`,
        problem: { ...id, kind: "short", available },
      };
    }
    if (detail?.[2] === "unavailable" || gone) {
      const id = detail ? { variantId: detail[1] } : who(gone![1]);
      return { ok: false, message: "One item is no longer on sale. Remove it to continue.", problem: { ...id, kind: "unavailable" } };
    }
    // A refused payment part: DETAIL is "payment:<n>:<problem>[:<receipt>]" (or "payment:short" for the whole sale).
    const pay = (error.details ?? "").match(/^payment:(?:\d+:)?([a-z_]+)(?::(.+))?$/);
    switch (pay?.[1]) {
      case "reference":
        return { ok: false, message: `${text.replace(/\.$/, "")}. Check it against the customer’s receipt.` };
      case "duplicate":
        return {
          ok: false,
          message: pay[2]
            ? `That reference is already on sale ${pay[2]}. Check the number on the customer’s receipt.`
            : "The same reference is in this sale twice. Check the numbers.",
        };
      case "provider":
        return { ok: false, message: "That bank or e-wallet isn’t accepted anymore. Pick another one." };
      case "cash_not_needed":
        return { ok: false, message: "The e-payments already cover the total, so take no cash." };
      case "cash_twice":
        return { ok: false, message: "Put all the cash in one payment." };
      case "amount":
      case "method":
        return { ok: false, message: "A payment doesn’t look right. Check the amounts and try again." };
    }
    if (error.code === "23505") return { ok: false, message: "That reference is already on another sale. Check the number on the customer’s receipt." };
    // A price can change between the last refresh and Charge; the database total is the real one.
    if (/less than the total/i.test(text)) return { ok: false, message: "The payment is less than the total. A price may have just changed; check the total." };
    if (/GCash reference/i.test(text)) return { ok: false, message: "Enter the 13-digit GCash reference number." };
    if (error.code === "42501") return { ok: false, message: "Your account isn’t allowed to record sales." };
    if (error.code === "P0002") return { ok: false, message: "An item in the sale doesn’t exist anymore. Remove it and try again." };
    return { ok: false, message: "We couldn’t record the sale, so nothing was saved. Try again." };
  }

  const sale = data as { id: string } | null;
  if (!sale?.id) return { ok: false, message: "The sale may not have saved. Check Sales before trying again." };
  return { ok: true, id: sale.id };
}

/** Owner only: returns the pieces to stock and marks the sale void. */
export async function voidSale(saleId: string, reason: string): Promise<VoidResult> {
  const { supabase, profile } = await requireStaff();
  if (profile.role !== "owner") return { ok: false, message: "Only the owner can void a sale." };
  if (typeof saleId !== "string" || !UUID.test(saleId) || typeof reason !== "string") {
    return { ok: false, message: "That sale doesn’t exist." };
  }
  const why = reason.trim().slice(0, 300);
  if (why.length < 3) return { ok: false, message: "Say why the sale is being voided." };

  const { error } = await supabase.rpc("void_pos_sale", { p_sale_id: saleId, p_reason: why });
  if (error) {
    if (error.code === "PGRST202") return { ok: false, message: `Voiding needs the latest database update (${MIGRATION}).` };
    if (/already voided/i.test(error.message)) return { ok: false, message: "This sale was already voided." };
    if (error.code === "42501") return { ok: false, message: "Only the owner can void a sale." };
    if (error.code === "P0002") return { ok: false, message: "That sale doesn’t exist." };
    return { ok: false, message: "We couldn’t void the sale. Nothing changed; try again." };
  }
  return { ok: true };
}
