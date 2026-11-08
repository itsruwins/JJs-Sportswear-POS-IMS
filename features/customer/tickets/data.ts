import type { SupabaseClient } from "@supabase/supabase-js";
import type { TicketStatus } from "@/features/shared/tickets/model";

// The customer's own counter tickets (RLS). Lines keep the name, size, color, and price
// from when the ticket was made; the live variant says whether it's still on the rack.

export type TicketSummary = {
  id: string;
  code: string;
  status: TicketStatus;
  createdAt: string;
  expiresAt: string;
  closedAt: string | null;
  pieces: number;
  /** At the prices the ticket was made with. */
  total: number;
  names: string[];
};

export type TicketLine = {
  position: number;
  name: string;
  size: string | null;
  color: string | null;
  price: number;
  quantity: number;
  /** Pieces on the rack now; null when the shop no longer sells it. */
  stockNow: number | null;
};

export type Ticket = TicketSummary & { lines: TicketLine[] };

type ItemRow = {
  position: number;
  product_name: string;
  size: string | null;
  color: string | null;
  unit_price: number | string;
  quantity: number;
  product_variants?: {
    stock_quantity: number;
    is_active: boolean;
    products: { is_active: boolean; made_to_order: boolean | null } | null;
  } | null;
};

type TicketRow = {
  id: string;
  code: string;
  status: TicketStatus;
  created_at: string;
  expires_at: string;
  closed_at: string | null;
  counter_ticket_items: ItemRow[] | null;
};

const SUMMARY = "id, code, status, created_at, expires_at, closed_at, counter_ticket_items (position, product_name, size, color, unit_price, quantity)";
const DETAIL =
  "id, code, status, created_at, expires_at, closed_at, counter_ticket_items (position, product_name, size, color, unit_price, quantity, product_variants (stock_quantity, is_active, products (is_active, made_to_order)))";

/** The tables aren't there until the tickets migration runs. */
export const ticketsMissing = (error: { code?: string } | null) => error?.code === "PGRST205" || error?.code === "42P01";

function toSummary(r: TicketRow): TicketSummary {
  const items = [...(r.counter_ticket_items ?? [])].sort((a, b) => a.position - b.position);
  return {
    id: r.id,
    code: r.code,
    status: r.status,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    closedAt: r.closed_at,
    pieces: items.reduce((n, i) => n + i.quantity, 0),
    total: items.reduce((n, i) => n + i.quantity * Number(i.unit_price), 0),
    names: [...new Set(items.map((i) => i.product_name))],
  };
}

function toLine(i: ItemRow): TicketLine {
  const v = i.product_variants;
  const sold = v && v.is_active && v.products?.is_active && !v.products.made_to_order;
  return {
    position: i.position,
    name: i.product_name,
    size: i.size,
    color: i.color,
    price: Number(i.unit_price),
    quantity: i.quantity,
    stockNow: sold ? Math.max(0, v.stock_quantity) : null,
  };
}

/** Every ticket but the ones folded into a newer ticket, newest first. */
export async function fetchMyTickets(supabase: SupabaseClient, customerId: string) {
  const { data, error } = await supabase
    .from("counter_tickets")
    .select(SUMMARY)
    .eq("customer_id", customerId)
    .neq("status", "replaced")
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<TicketRow[]>();
  return { tickets: (data ?? []).map(toSummary), error, missing: ticketsMissing(error) };
}

/** One ticket by its code, with its lines against today's stock. */
export async function fetchMyTicket(supabase: SupabaseClient, customerId: string, code: string) {
  const { data, error } = await supabase
    .from("counter_tickets")
    .select(DETAIL)
    .eq("customer_id", customerId)
    .eq("code", code)
    .maybeSingle<TicketRow>();
  if (!data) return { ticket: null, error };
  const ticket: Ticket = {
    ...toSummary(data),
    lines: [...(data.counter_ticket_items ?? [])].sort((a, b) => a.position - b.position).map(toLine),
  };
  return { ticket, error };
}

/** The ticket waiting to be shown at the counter, if there is one (open and not expired). */
export async function fetchOpenTicket(supabase: SupabaseClient, customerId: string) {
  const { data } = await supabase
    .from("counter_tickets")
    .select(SUMMARY)
    .eq("customer_id", customerId)
    .eq("status", "open")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<TicketRow[]>();
  return data?.[0] ? toSummary(data[0]) : null;
}
