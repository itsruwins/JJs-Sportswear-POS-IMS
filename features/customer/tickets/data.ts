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
  variantId: string | null;
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
  variant_id?: string | null;
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
  "id, code, status, created_at, expires_at, closed_at, counter_ticket_items (position, variant_id, product_name, size, color, unit_price, quantity, product_variants (stock_quantity, is_active, products (is_active, made_to_order)))";

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
    variantId: i.variant_id ?? null,
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

export type TicketReceipt = {
  receiptNumber: string;
  paidAt: string;
  total: number;
  change: number;
  lines: { key: string; name: string; size: string | null; color: string | null; quantity: number; price: number; subtotal: number }[];
  payments: { key: string; label: string; amount: number; reference: string | null }[];
};

type ReceiptRow = {
  receipt_number: string;
  created_at: string;
  subtotal: number | string;
  change_amount: number | string;
  sale_items:
    | {
        id: string;
        variant_id: string;
        quantity: number;
        unit_price: number | string;
        subtotal: number | string;
        variant: { size: string | null; color: string | null; product: { name: string } | null } | null;
      }[]
    | null;
  sale_payments:
    | { position: number; method: "cash" | "e_payment"; provider: string | null; reference: string | null; amount: number | string; provider_row: { name: string } | null }[]
    | null;
};

/**
 * The receipt for a paid ticket: what the counter rang up, read through the customer's own
 * ticket (RLS). Null until the ticket-sales update (20261025000000) runs, or for a ticket
 * paid before it. A line whose item the shop has since hidden keeps the ticket's name for it.
 */
export async function fetchTicketReceipt(supabase: SupabaseClient, ticket: Ticket): Promise<TicketReceipt | null> {
  const { data: t, error } = await supabase.from("counter_tickets").select("sale_id").eq("id", ticket.id).maybeSingle<{ sale_id: string | null }>();
  if (error || !t?.sale_id) return null;
  const { data } = await supabase
    .from("sales")
    .select(
      "receipt_number, created_at, subtotal, change_amount, sale_items (id, variant_id, quantity, unit_price, subtotal, variant:product_variants (size, color, product:products (name))), sale_payments (position, method, provider, reference, amount, provider_row:payment_providers (name))",
    )
    .eq("id", t.sale_id)
    .maybeSingle<ReceiptRow>();
  if (!data) return null;
  const names = new Map(ticket.lines.flatMap((l) => (l.variantId ? [[l.variantId, l.name] as const] : [])));
  return {
    receiptNumber: data.receipt_number,
    paidAt: data.created_at,
    total: Number(data.subtotal),
    change: Number(data.change_amount),
    lines: (data.sale_items ?? []).map((i) => ({
      key: i.id,
      name: i.variant?.product?.name ?? names.get(i.variant_id) ?? "Item",
      size: i.variant?.size ?? null,
      color: i.variant?.color ?? null,
      quantity: i.quantity,
      price: Number(i.unit_price),
      subtotal: Number(i.subtotal),
    })),
    payments: [...(data.sale_payments ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((p) => ({
        key: String(p.position),
        label: p.method === "cash" ? "Cash" : (p.provider_row?.name ?? p.provider ?? "E-payment"),
        amount: Number(p.amount),
        reference: p.method === "cash" ? null : p.reference,
      })),
  };
}
