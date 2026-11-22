"use server";

import { formatPeso } from "@/features/shared/catalog/catalog";
import { cleanReference } from "@/features/shared/payments/model";
import { TICKET_ORDERS_MIGRATION } from "@/features/shared/tickets/model";
import { requireStaff } from "@/features/admin/shell/session";
import { COUNTER_ORDERS_MIGRATION } from "./data";
import { MAX_PIECES, phoneOk } from "./model";
import { nameToRow, toSuffix, type NameParts } from "@/features/shared/names/model";
import { checkName } from "@/features/shared/names/validation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export type CounterPayment =
  | { method: "cash"; amount: number }
  | { method: "e_payment"; amount: number; provider: string; reference: string; scanId?: string | null };

export type PlaceInput = {
  items: { variantId: string; quantity: number }[];
  buyer: NameParts & { phone: string };
  details: { team: string; neededBy: string; notes: string };
  payments: CounterPayment[];
  requestId: string;
  /** The customer's design ticket this order takes, if it came from one. */
  ticketId?: string | null;
};

/** Which field a refusal is about, so the form can point at it. */
export type PlaceField = "first_name" | "middle_name" | "last_name" | "suffix" | "phone" | "needed_by" | "items" | "payment";
export type PlaceResult =
  | { ok: true; id: string }
  | {
      ok: false;
      message: string;
      field?: PlaceField;
      unavailable?: boolean;
      /** The ticket can't be taken anymore (ordered, expired, cancelled): take the order without it. */
      ticketClosed?: boolean;
    };

/**
 * Takes a design order at the counter: the order, accepted at its catalog price, with what's paid now.
 * With a design ticket, create_ticket_order places it and marks the ticket ordered in the same step.
 */
export async function placeCounterOrder(raw: PlaceInput): Promise<PlaceResult> {
  const { supabase } = await requireStaff();

  const items = Array.isArray(raw?.items)
    ? raw.items.filter((i) => isId(i?.variantId) && Number.isInteger(i?.quantity) && i.quantity >= 1 && i.quantity <= MAX_PIECES)
    : [];
  if (!items.length || items.length !== raw.items.length) return { ok: false, message: "Add at least one piece to the order.", field: "items" };

  const name: NameParts = {
    firstName: text(raw?.buyer?.firstName, 60),
    middleName: text(raw?.buyer?.middleName, 60),
    lastName: text(raw?.buyer?.lastName, 60),
    suffix: toSuffix(text(raw?.buyer?.suffix, 10)),
  };
  const phone = text(raw?.buyer?.phone, 20);
  const nameErrors = checkName(name, "the buyer’s");
  const nameField = ({ firstName: "first_name", middleName: "middle_name", lastName: "last_name", suffix: "suffix" } as const);
  for (const key of ["firstName", "lastName", "middleName", "suffix"] as const) {
    if (nameErrors[key]) return { ok: false, message: nameErrors[key], field: nameField[key] };
  }
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
  const ticketId = raw?.ticketId ?? null;
  if (ticketId !== null && !isId(ticketId)) return { ok: false, message: "This order is out of date. Reload the page and try again." };

  const args = {
    p_items: items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
    p_buyer: { ...nameToRow(name), phone },
    p_details: { team: text(raw?.details?.team, 80), needed_by: neededBy || null, notes: text(raw?.details?.notes, 2000) },
    p_payments: payments,
    p_request_id: raw.requestId,
  };
  const { data, error } = ticketId
    ? await supabase.rpc("create_ticket_order", { p_ticket_id: ticketId, ...args })
    : await supabase.rpc("create_counter_order", args);
  if (error) {
    const msg = error.message ?? "";
    const detail = error.details ?? "";
    if (ticketId && error.code === "PGRST202") {
      return {
        ok: false,
        message: `Taking design tickets needs the latest database update (${TICKET_ORDERS_MIGRATION}). Remove the ticket to take this as a regular order.`,
      };
    }
    // A ticket that can't be taken: say what happened to it.
    const ticketDetail = detail.match(/^ticket:([a-z]+)$/)?.[1];
    if (ticketDetail) {
      const why: Record<string, string> = {
        ordered: "This ticket was already taken as an order.",
        paid: "This ticket was already paid.",
        expired: "This ticket expired.",
        cancelled: "The customer cancelled this ticket.",
        replaced: "This ticket was replaced by a newer one. Ask the customer for their latest code.",
        missing: "This ticket doesn’t exist anymore.",
        ready: "This is a ready-made ticket; it’s charged on the Shelf tab.",
        taken: "That order already belongs to another ticket.",
      };
      return {
        ok: false,
        message: `${why[ticketDetail] ?? "This ticket can’t be taken."} Nothing was saved. Remove the ticket to take this as a regular order.`,
        ticketClosed: true,
      };
    }
    if (error.code === "PGRST202") return { ok: false, message: `Design orders need the shop’s latest database update (${COUNTER_ORDERS_MIGRATION}).` };
    if (error.code === "42501") return { ok: false, message: "Your account can’t take orders at the counter." };
    const nameRefused = detail.match(/^order:(first_name|middle_name|last_name|suffix)$/)?.[1] as PlaceField | undefined;
    if (nameRefused) return { ok: false, message: msg.replace(/'/g, "’") + ".", field: nameRefused };
    // A database without the name-parts update reads only the old one-line name.
    if (detail === "order:name") return { ok: false, message: "Taking a buyer’s name in parts needs the latest database update (supabase/migrations/20261030000000_name_parts.sql)." };
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
