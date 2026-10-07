"use server";

import { revalidatePath } from "next/cache";
import { REQUESTS_MIGRATION } from "@/lib/customer/order-data";
import { MAX_REFERENCES, type OrderLine } from "@/lib/customer/orders";
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
