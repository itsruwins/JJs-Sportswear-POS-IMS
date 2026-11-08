// Counter tickets: a customer's cart sealed into a short code to show at the counter.
// Shared because the customer makes them and the POS loads them (T3). No database here.

export const TICKETS_MIGRATION = "supabase/migrations/20261024000000_counter_tickets.sql";

/** How long a ticket stays good, as the database sets it. */
export const TICKET_DAYS = 3;

/** JJ- and 5 of 31 characters: no 0/O or 1/I/L, so a code read aloud or typed can't be mistaken. */
export const TICKET_CODE = /^JJ-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/;

/**
 * A typed or scanned code in the shop's form: case, spaces, and dashes don't matter, and
 * the JJ- prefix is optional ("7k3 qm" → "JJ-7K3QM"). Null when it can't be a code.
 */
export function normalizeTicketCode(input: string) {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = raw.length === 7 && raw.startsWith("JJ") ? raw.slice(2) : raw;
  const code = `JJ-${body}`;
  return TICKET_CODE.test(code) ? code : null;
}

export type TicketStatus = "open" | "cancelled" | "replaced" | "paid";

/** What a ticket means to people: open past its time reads as expired. */
export type TicketState = "ready" | "expired" | "cancelled" | "replaced" | "paid";

export function ticketState(t: { status: TicketStatus; expiresAt: string; closedAt: string | null }, now = Date.now()): TicketState {
  if (t.status === "open") return new Date(t.expiresAt).getTime() > now ? "ready" : "expired";
  // Put back in the cart after it ran out: it still reads as expired.
  if (t.status === "cancelled" && t.closedAt && new Date(t.closedAt).getTime() > new Date(t.expiresAt).getTime()) return "expired";
  return t.status;
}

export const TICKET_STATE_TEXT: Record<TicketState, string> = {
  ready: "Ready for the counter",
  expired: "Expired",
  cancelled: "Cancelled",
  replaced: "Replaced",
  paid: "Paid",
};

/** "Wed, Nov 12 · 5:30 PM", in the shop's time. */
export function ticketTime(iso: string) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "Asia/Manila" }).format(d);
  const time = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }).format(d);
  return `${day} · ${time}`;
}
