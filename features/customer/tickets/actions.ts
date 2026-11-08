"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { requireCustomer } from "@/features/customer/shell/session";
import { TICKETS_MIGRATION } from "@/features/shared/tickets/model";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TicketResult = { ok: true } | { ok: false; message: string };

function explain(error: { code?: string; message?: string; details?: string | null }): { ok: false; message: string } {
  if (error.code === "PGRST202") {
    return { ok: false, message: `Counter tickets need the latest database update (${TICKETS_MIGRATION}). Ask the shop to run it.` };
  }
  if (error.details === "empty") return { ok: false, message: "Nothing in your cart is on the rack right now, so there’s nothing to put on a ticket." };
  if (error.details === "closed") return { ok: false, message: "This ticket is already closed. Refresh the page to see where it stands." };
  if (error.code === "P0002") return { ok: false, message: "That ticket doesn’t exist anymore." };
  if (error.code === "42501") return { ok: false, message: "Only customer accounts have counter tickets." };
  return { ok: false, message: "We couldn’t do that just now. Check your connection and try again." };
}

/** Seals the cart's buyable lines into a ticket, then opens it. */
export async function createTicket(): Promise<TicketResult> {
  const { supabase } = await requireCustomer();
  const { data, error } = await supabase.rpc("create_counter_ticket");
  if (error || typeof data !== "string") {
    refresh();
    return error ? explain(error) : { ok: false, message: "We couldn’t make your ticket just now. Try again." };
  }
  redirect(`/orders/tickets/${data}`);
}

/**
 * Puts an open (or expired) ticket's items back in the cart and closes it. "cart" goes to
 * the cart to change them; "stay" keeps the customer on the ticket, now cancelled.
 */
export async function returnTicket(ticketId: string, then: "cart" | "stay"): Promise<TicketResult> {
  const { supabase } = await requireCustomer();
  if (typeof ticketId !== "string" || !UUID.test(ticketId)) return { ok: false, message: "That ticket doesn’t exist anymore." };
  const { error } = await supabase.rpc("return_counter_ticket", { p_ticket_id: ticketId });
  if (error) {
    refresh();
    return explain(error);
  }
  if (then === "cart") redirect("/cart");
  refresh();
  return { ok: true };
}
