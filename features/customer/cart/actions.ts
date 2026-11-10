"use server";

import { refresh } from "next/cache";
import { requireCustomer } from "@/features/customer/shell/session";
import { DESIGN_TICKETS_MIGRATION } from "@/features/shared/tickets/model";
import { CART_MIGRATION, MAX_PER_LINE } from "./model";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CartResult =
  | { ok: true; quantity: number; capped: boolean }
  | { ok: false; message: string; reason?: "sold_out" | "unavailable" | "full" };

/** Plain sentences for what cart_set refuses. */
function explain(error: { code?: string; message?: string; details?: string | null }): CartResult {
  if (error.code === "PGRST202") {
    return { ok: false, message: `The cart needs the latest database update (${CART_MIGRATION}). Ask the shop to run it.` };
  }
  const reason = error.details === "sold_out" || error.details === "unavailable" || error.details === "full" ? error.details : undefined;
  if (reason) return { ok: false, message: error.message ?? "Check your cart and try again.", reason };
  if (error.code === "22023") return { ok: false, message: error.message ?? `Pick between 1 and ${MAX_PER_LINE} pieces.` };
  if (error.code === "42501") return { ok: false, message: "Only customer accounts have a cart." };
  return { ok: false, message: "We couldn’t update your cart just now. Check your connection and try again." };
}

async function cartSet(variantId: string, quantity: number, add: boolean): Promise<CartResult> {
  const { supabase } = await requireCustomer();
  if (typeof variantId !== "string" || !UUID.test(variantId) || !Number.isInteger(quantity) || quantity < 0 || quantity > MAX_PER_LINE) {
    return { ok: false, message: `Pick between 1 and ${MAX_PER_LINE} pieces.` };
  }
  const { data, error } = await supabase.rpc("cart_set", { p_variant_id: variantId, p_quantity: quantity, p_add: add });
  // Refresh either way: a refusal usually means stock moved, and the page should show it.
  refresh();
  if (error) return explain(error);
  const now = Number(data);
  return { ok: true, quantity: now, capped: quantity > 0 && (add ? false : now < quantity) };
}

/** Adds pieces of one size and color; the database caps the line at the stock on hand. */
export async function addToCart(variantId: string, quantity = 1): Promise<CartResult> {
  return cartSet(variantId, quantity, true);
}

/** Sets a line's quantity; 0 removes it. */
export async function setCartQuantity(variantId: string, quantity: number): Promise<CartResult> {
  return cartSet(variantId, quantity, false);
}

export type RunResult = { ok: true; pieces: number } | { ok: false; message: string };

/**
 * Adds a design's size run (S ×3, M ×5, …) in one step: every size goes in, or none does.
 * Each size caps at 99 in the cart. Returns the pieces now in the cart for those sizes.
 */
export async function addRunToCart(sizes: { variantId: string; quantity: number }[]): Promise<RunResult> {
  const { supabase } = await requireCustomer();
  const ok =
    Array.isArray(sizes) &&
    sizes.length >= 1 &&
    sizes.length <= 20 &&
    new Set(sizes.map((s) => s?.variantId)).size === sizes.length &&
    sizes.every((s) => typeof s?.variantId === "string" && UUID.test(s.variantId) && Number.isInteger(s.quantity) && s.quantity >= 1 && s.quantity <= MAX_PER_LINE);
  if (!ok) return { ok: false, message: `Pick at least one size, up to ${MAX_PER_LINE} pieces each.` };
  const { data, error } = await supabase.rpc("cart_add_run", {
    p_items: sizes.map((s) => ({ variant_id: s.variantId, quantity: s.quantity })),
  });
  refresh();
  if (error) {
    if (error.code === "PGRST202") {
      return { ok: false, message: `Designs in the cart need the latest database update (${DESIGN_TICKETS_MIGRATION}). Ask the shop to run it.` };
    }
    const r = explain(error);
    return { ok: false, message: r.ok ? "" : r.message };
  }
  return { ok: true, pieces: Number(data) };
}
