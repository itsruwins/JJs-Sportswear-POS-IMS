"use server";

import { requireStaff } from "@/features/admin/shell/session";
import type { PaymentMethod } from "@/features/admin/sales/data";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The final sale function arrives with this follow-up (after 20261007000000_pos_gcash_and_voids.sql).
const MIGRATION = "supabase/migrations/20261007120000_pos_sale_key.sql";

export type CartItem = { variantId: string; quantity: number };

/** A refused item points back to its cart line, so the cart can offer the fix. */
export type LineProblem = { variantId?: string; sku?: string; kind: "short"; available: number } | { variantId?: string; sku?: string; kind: "unavailable" };

export type SaleResult = { ok: true; id: string } | { ok: false; message: string; problem?: LineProblem };
export type VoidResult = { ok: true } | { ok: false; message: string };

/** Records a counter sale through create_pos_sale; prices and stock are checked by the database. */
export async function createSale(
  items: CartItem[],
  method: PaymentMethod,
  amountPaid: number,
  gcashRef: string,
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
    (method === "cash" || method === "gcash") &&
    typeof amountPaid === "number" &&
    Number.isFinite(amountPaid) &&
    amountPaid >= 0 &&
    amountPaid < 10_000_000 &&
    typeof gcashRef === "string" &&
    typeof requestId === "string" &&
    UUID.test(requestId);
  if (!valid) return { ok: false, message: "This sale doesn’t look right. Check the cart and try again." };

  const ref = gcashRef.replace(/\D/g, "");
  if (method === "gcash" && ref.length !== 13) return { ok: false, message: "Enter the 13-digit GCash reference number." };

  const p_items = items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity }));
  const p_amount_paid = Math.round(amountPaid * 100) / 100;
  let { data, error } = await supabase.rpc("create_pos_sale", {
    p_items,
    p_amount_paid,
    p_payment_method: method,
    p_gcash_reference: method === "gcash" ? ref : null,
    p_request_id: requestId,
  });
  // Before the migration runs, only the original three-argument function exists. Cash sales still
  // work through it; GCash sales wait, since the reference would be lost.
  if (error?.code === "PGRST202") {
    if (method === "gcash") {
      return { ok: false, message: `GCash sales need the latest database update (${MIGRATION}). Cash sales work in the meantime.` };
    }
    ({ data, error } = await supabase.rpc("create_pos_sale", { p_items, p_amount_paid, p_payment_method: method }));
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
    if (error.code === "23505") return { ok: false, message: "That GCash reference is already on another sale. Check the number on the customer’s screen." };
    // A price can change between the last refresh and Charge; the database total is the real one.
    if (/less than the total/i.test(text)) return { ok: false, message: "The cash received is less than the total. A price may have just changed; check the total." };
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
