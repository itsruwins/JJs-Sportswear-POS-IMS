"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { requireCustomer } from "@/features/customer/shell/session";
import { DESIGN_TICKETS_MIGRATION, ROSTER_MAX, TEAM_NAME_MAX, TICKETS_MIGRATION, type TicketKind } from "@/features/shared/tickets/model";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TicketResult = { ok: true } | { ok: false; message: string };

function explain(error: { code?: string; message?: string; details?: string | null }): { ok: false; message: string } {
  if (error.code === "PGRST202") {
    return { ok: false, message: `Counter tickets need the latest database update (${TICKETS_MIGRATION}). Ask the shop to run it.` };
  }
  if (error.details === "empty") return { ok: false, message: error.message?.includes("designs") ? "There are no designs in your cart." : "Nothing in your cart is on the rack right now, so there’s nothing to put on a ticket." };
  if (error.details === "needed_by") return { ok: false, message: "That date has already passed. Pick today or later." };
  if (error.details === "kind") return { ok: false, message: "Only design tickets have team details." };
  if (error.details === "closed") return { ok: false, message: "This ticket can’t be changed anymore. Refresh the page to see where it stands." };
  if (error.code === "P0002") return { ok: false, message: "That ticket doesn’t exist anymore." };
  if (error.code === "42501") return { ok: false, message: "Only customer accounts have counter tickets." };
  return { ok: false, message: "We couldn’t do that just now. Check your connection and try again." };
}

/**
 * Seals one kind of the cart into a ticket, then opens it: the ready-made lines on the rack, or
 * the designs. Ready-made works before the design update too (it was the only kind then).
 */
export async function createTicket(kind: TicketKind = "ready"): Promise<TicketResult> {
  const { supabase } = await requireCustomer();
  if (kind !== "ready" && kind !== "design") return { ok: false, message: "We couldn’t make your ticket just now. Try again." };
  const { data, error } = await (kind === "design" ? supabase.rpc("create_counter_ticket", { p_kind: "design" }) : supabase.rpc("create_counter_ticket"));
  if (error || typeof data !== "string") {
    refresh();
    if (kind === "design" && error?.code === "PGRST202") {
      return { ok: false, message: `Design tickets need the latest database update (${DESIGN_TICKETS_MIGRATION}). Ask the shop to run it.` };
    }
    return error ? explain(error) : { ok: false, message: "We couldn’t make your ticket just now. Try again." };
  }
  redirect(`/orders/tickets/${data}`);
}

export type TeamDetails = { team: string; neededBy: string; roster: string };

/** Saves the optional team details on an open design ticket; blank fields are cleared. */
export async function setTicketDetails(ticketId: string, details: TeamDetails): Promise<TicketResult> {
  const { supabase } = await requireCustomer();
  if (typeof ticketId !== "string" || !UUID.test(ticketId)) return { ok: false, message: "That ticket doesn’t exist anymore." };
  const team = String(details?.team ?? "").trim();
  const roster = String(details?.roster ?? "").trim();
  const neededBy = String(details?.neededBy ?? "").trim();
  if (team.length > TEAM_NAME_MAX) return { ok: false, message: `Keep the team name to ${TEAM_NAME_MAX} characters.` };
  if (roster.length > ROSTER_MAX) return { ok: false, message: `Keep the names and numbers to ${ROSTER_MAX} characters.` };
  if (neededBy && !/^\d{4}-\d{2}-\d{2}$/.test(neededBy)) return { ok: false, message: "That date doesn’t look right. Pick it from the calendar." };
  const { error } = await supabase.rpc("set_ticket_details", {
    p_ticket_id: ticketId,
    p_team: team || null,
    p_needed_by: neededBy || null,
    p_roster: roster || null,
  });
  refresh();
  if (error) {
    if (error.code === "PGRST202") return { ok: false, message: `Team details need the latest database update (${DESIGN_TICKETS_MIGRATION}). Ask the shop to run it.` };
    if (error.code === "22007" || error.code === "22008") return { ok: false, message: "That date doesn’t look right. Pick it from the calendar." };
    return explain(error);
  }
  return { ok: true };
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
