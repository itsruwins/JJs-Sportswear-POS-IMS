"use server";

import { formatPeso } from "@/features/shared/catalog/catalog";
import { cleanReference } from "@/features/shared/payments/model";
import { requireStaff } from "@/features/admin/shell/session";
import { COUNTER_ORDERS_MIGRATION } from "./data";
import { MAX_PIECES, phoneOk } from "./model";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export type CounterPayment =
  | { method: "cash"; amount: number }
  | { method: "e_payment"; amount: number; provider: string; reference: string; scanId?: string | null };

export type PlaceInput = {
  items: { variantId: string; quantity: number }[];
  buyer: { name: string; phone: string };
  details: { team: string; neededBy: string; notes: string };
  payments: CounterPayment[];
  requestId: string;
};

/** Which field a refusal is about, so the form can point at it. */
export type PlaceField = "name" | "phone" | "needed_by" | "items" | "payment";
export type PlaceResult = { ok: true; id: string } | { ok: false; message: string; field?: PlaceField; unavailable?: boolean };

/** Takes a design order at the counter: the order, accepted at its catalog price, with what's paid now. */
export async function placeCounterOrder(raw: PlaceInput): Promise<PlaceResult> {
  const { supabase } = await requireStaff();

  const items = Array.isArray(raw?.items)
    ? raw.items.filter((i) => isId(i?.variantId) && Number.isInteger(i?.quantity) && i.quantity >= 1 && i.quantity <= MAX_PIECES)
    : [];
  if (!items.length || items.length !== raw.items.length) return { ok: false, message: "Add at least one piece to the order.", field: "items" };

  const name = text(raw?.buyer?.name, 80);
  const phone = text(raw?.buyer?.phone, 20);
  if (name.length < 2) return { ok: false, message: "Enter the buyer’s name.", field: "name" };
  if (!phoneOk(phone)) return { ok: false, message: "Enter the buyer’s phone number.", field: "phone" };
  const neededBy = text(raw?.details?.neededBy, 10);
  if (neededBy && !/^\d{4}-\d{2}-\d{2}$/.test(neededBy)) return { ok: false, message: "Pick a needed-by date.", field: "needed_by" };

  const parts = Array.isArray(raw?.payments) ? raw.payments : [];
  const payments = parts.map((p) =>
    p?.method === "e_payment"
      ? {
          method: "e_payment",
          amount: Number(p.amount),
          provider: typeof p.provider === "string" && /^[a-z][a-z0-9_]{1,31}$/.test(p.provider) ? p.provider : "",
          reference: cleanReference(String(p.reference ?? "")).slice(0, 60),
          scan_id: isId(p.scanId) ? p.scanId : null,
        }
      : { method: "cash", amount: Number(p?.amount) },
  );
  if (!payments.length || payments.some((p) => !Number.isFinite(p.amount) || p.amount <= 0 || ("provider" in p && (!p.provider || !p.reference)))) {
    return { ok: false, message: "Check the payment and try again.", field: "payment" };
  }
  if (!isId(raw?.requestId)) return { ok: false, message: "This order is out of date. Reload the page and try again." };

  const { data, error } = await supabase.rpc("create_counter_order", {
    p_items: items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
    p_buyer: { name, phone },
    p_details: { team: text(raw?.details?.team, 80), needed_by: neededBy || null, notes: text(raw?.details?.notes, 2000) },
    p_payments: payments,
    p_request_id: raw.requestId,
  });
  if (error) {
    const msg = error.message ?? "";
    const detail = error.details ?? "";
    if (error.code === "PGRST202") return { ok: false, message: `Design orders need the shop’s latest database update (${COUNTER_ORDERS_MIGRATION}).` };
    if (error.code === "42501") return { ok: false, message: "Your account can’t take orders at the counter." };
    if (detail === "order:name") return { ok: false, message: "Enter the buyer’s name.", field: "name" };
    if (detail === "order:phone") return { ok: false, message: "Enter the buyer’s phone number.", field: "phone" };
    if (detail === "order:needed_by") return { ok: false, message: msg.replace(/'/g, "’") + ".", field: "needed_by" };
    if (detail === "order:unavailable") {
      return { ok: false, message: "A design, style, or size in this order isn’t offered anymore. The list has been refreshed.", unavailable: true };
    }
    const half = msg.match(/at least ₱([\d.]+) \(half of ₱([\d.]+)\)/);
    if (half) return { ok: false, message: `The down payment is at least ${formatPeso(Number(half[1]))}, half of ${formatPeso(Number(half[2]))}.`, field: "payment" };
    if (detail === "order:over_total") return { ok: false, message: "That’s more than the order’s total. Take the full amount at most.", field: "payment" };
    const taken = detail.match(/^payment:duplicate:(.+)$/);
    if (taken || error.code === "23505") {
      return { ok: false, message: `That reference was already used${taken ? ` (${taken[1]})` : ""}. Check the number on the receipt.`, field: "payment" };
    }
    if (detail === "payment:reference") return { ok: false, message: "That reference number doesn’t look right for this provider. Check it against the receipt.", field: "payment" };
    if (detail === "payment:provider") return { ok: false, message: "That bank or e-wallet isn’t accepted anymore. Pick another one.", field: "payment" };
    if (/reference/i.test(msg)) return { ok: false, message: "An e-payment needs its reference number.", field: "payment" };
    return { ok: false, message: "We couldn’t place the order. Nothing was saved; try again." };
  }
  return { ok: true, id: (data as { id: string }).id };
}
