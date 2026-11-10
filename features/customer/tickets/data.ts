import type { SupabaseClient } from "@supabase/supabase-js";
import type { TicketKind, TicketStatus } from "@/features/shared/tickets/model";
import type { OrderStatus } from "@/features/customer/orders/model";

// The customer's own counter tickets (RLS). Lines keep the name, size, color, and price
// from when the ticket was made; the live variant says whether it's still on the rack.

export type TicketSummary = {
  id: string;
  code: string;
  kind: TicketKind;
  status: TicketStatus;
  createdAt: string;
  expiresAt: string;
  closedAt: string | null;
  pieces: number;
  /** At the prices the ticket was made with. */
  total: number;
  names: string[];
  /** Design tickets: the optional team details (all null on a ready-made ticket). */
  team: string | null;
  neededBy: string | null;
  roster: string | null;
  /** A design ticket taken at the counter: the order it made, read through the ticket. */
  order: TicketOrderSummary | null;
};

export type TicketOrderSummary = {
  id: string;
  number: string;
  status: OrderStatus;
  total: number;
  /** Payments the shop has recorded. */
  paid: number;
  /** What's left to pay at pickup. */
  balance: number;
};

export type TicketLine = {
  position: number;
  variantId: string | null;
  name: string;
  size: string | null;
  color: string | null;
  price: number;
  quantity: number;
  /** Pieces on the rack now; null when the shop no longer sells it. A design keeps no stock (0). */
  stockNow: number | null;
  /** A made-to-order design's size: made after ordering, so stock never runs short. */
  design: boolean;
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
  kind?: TicketKind;
  team_name?: string | null;
  needed_by?: string | null;
  roster?: string | null;
  status: TicketStatus;
  created_at: string;
  expires_at: string;
  closed_at: string | null;
  counter_ticket_items: ItemRow[] | null;
  custom_order?: OrderRow | null;
};

type OrderRow = {
  id: string;
  order_number: string;
  status: OrderStatus;
  total_price: number | string | null;
  payments: { amount: number | string; status: string }[] | null;
};

// Kind and team details come with 20261027000000_design_tickets.sql; before it, every ticket is ready-made.
// The order a design ticket made comes with 20261028000000_design_ticket_orders.sql, and the customer can
// read it once 20261029000000_ticket_order_view.sql runs (until then it reads as no order).
const BASE = "id, code, status, created_at, expires_at, closed_at";
const KIND = "kind, team_name, needed_by, roster";
const ORDER = "custom_order:custom_orders (id, order_number, status, total_price, payments (amount, status))";
const SUMMARY_ITEMS = "counter_ticket_items (position, product_name, size, color, unit_price, quantity)";
const DETAIL_ITEMS =
  "counter_ticket_items (position, variant_id, product_name, size, color, unit_price, quantity, product_variants (stock_quantity, is_active, products (is_active, made_to_order)))";
/** 2: kind and order; 1: kind only (before the orders update); 0: neither (before the design tickets update). */
type Level = 0 | 1 | 2;
const select = (items: string, level: Level) => [BASE, level >= 1 ? KIND : "", level === 2 ? ORDER : "", items].filter(Boolean).join(", ");
const olderTickets = (e: { code?: string } | null) => e?.code === "42703" || e?.code === "PGRST200";

/** Runs a read at the newest level the database has, stepping down while a column or link is missing. */
async function newest<R extends { error: { code?: string } | null }>(run: (level: Level) => PromiseLike<R>, top: Level = 2): Promise<R> {
  let level = top;
  let res = await run(level);
  while (olderTickets(res.error) && level > 0) res = await run(--level as Level);
  return res;
}

/** The tables aren't there until the tickets migration runs. */
export const ticketsMissing = (error: { code?: string } | null) => error?.code === "PGRST205" || error?.code === "42P01";

function toSummary(r: TicketRow): TicketSummary {
  const items = [...(r.counter_ticket_items ?? [])].sort((a, b) => a.position - b.position);
  return {
    id: r.id,
    code: r.code,
    kind: r.kind ?? "ready",
    status: r.status,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    closedAt: r.closed_at,
    pieces: items.reduce((n, i) => n + i.quantity, 0),
    total: items.reduce((n, i) => n + i.quantity * Number(i.unit_price), 0),
    names: [...new Set(items.map((i) => i.product_name))],
    team: r.team_name ?? null,
    neededBy: r.needed_by ?? null,
    roster: r.roster ?? null,
    order: r.custom_order ? toOrderSummary(r.custom_order) : null,
  };
}

function toOrderSummary(o: OrderRow): TicketOrderSummary {
  const total = Number(o.total_price ?? 0);
  const paid = (o.payments ?? []).filter((p) => p.status === "verified").reduce((n, p) => n + Number(p.amount), 0);
  return { id: o.id, number: o.order_number, status: o.status, total, paid, balance: Math.max(0, total - paid) };
}

function toLine(i: ItemRow): TicketLine {
  const v = i.product_variants;
  const design = !!v?.products?.made_to_order;
  const sold = v && v.is_active && v.products?.is_active;
  return {
    position: i.position,
    variantId: i.variant_id ?? null,
    name: i.product_name,
    size: i.size,
    color: i.color,
    price: Number(i.unit_price),
    quantity: i.quantity,
    stockNow: sold ? (design ? 0 : Math.max(0, v.stock_quantity)) : null,
    design,
  };
}

/** Every ticket but the ones folded into a newer ticket, newest first. */
export async function fetchMyTickets(supabase: SupabaseClient, customerId: string) {
  const { data, error } = await newest((level) =>
    supabase
      .from("counter_tickets")
      .select(select(SUMMARY_ITEMS, level))
      .eq("customer_id", customerId)
      .neq("status", "replaced")
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<TicketRow[]>(),
  );
  return { tickets: (data ?? []).map(toSummary), error, missing: ticketsMissing(error) };
}

/** One ticket by its code, with its lines against today's stock. */
export async function fetchMyTicket(supabase: SupabaseClient, customerId: string, code: string) {
  const { data, error } = await newest((level) =>
    supabase.from("counter_tickets").select(select(DETAIL_ITEMS, level)).eq("customer_id", customerId).eq("code", code).maybeSingle<TicketRow>(),
  );
  if (!data) return { ticket: null, error };
  const ticket: Ticket = {
    ...toSummary(data),
    lines: [...(data.counter_ticket_items ?? [])].sort((a, b) => a.position - b.position).map(toLine),
  };
  return { ticket, error };
}

/** The tickets waiting to be shown at the counter (open and not expired): one of each kind at most. */
export async function fetchOpenTickets(supabase: SupabaseClient, customerId: string): Promise<Record<TicketKind, TicketSummary | null>> {
  // Open tickets haven't made an order yet.
  const { data } = await newest(
    (level) =>
      supabase
        .from("counter_tickets")
        .select(select(SUMMARY_ITEMS, level))
        .eq("customer_id", customerId)
        .eq("status", "open")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(10)
        .returns<TicketRow[]>(),
    1,
  );
  const open = (data ?? []).map(toSummary);
  return { ready: open.find((t) => t.kind === "ready") ?? null, design: open.find((t) => t.kind === "design") ?? null };
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

export type TicketOrder = TicketOrderSummary & {
  orderedAt: string;
  readyAt: string | null;
  completedAt: string | null;
  team: string | null;
  neededBy: string | null;
  notes: string | null;
  /** What the counter took, which staff may have changed from the ticket: one line per design, style, and size. */
  lines: { key: string; name: string; style: string | null; size: string; quantity: number; price: number }[];
  /** Payments the shop recorded, oldest first. */
  payments: { key: string; label: string; amount: number; at: string }[];
};

type OrderDetailRow = Omit<OrderRow, "payments"> & {
  created_at: string;
  ready_at: string | null;
  completed_at: string | null;
  team_name: string | null;
  needed_by: string | null;
  notes: string | null;
  custom_order_items: { id: string; garment: string; color: string | null; size: string; quantity: number; unit_price: number | string | null }[] | null;
  payments: { id: string; amount: number | string; status: string; method: "cash" | "e_payment" | "gcash"; created_at: string; provider_row?: { name: string } | null }[] | null;
};

/**
 * The order a design ticket made at the counter, read through the customer's own ticket (RLS,
 * 20261029000000_ticket_order_view.sql). Null before that update, or if the order is gone.
 */
export async function fetchTicketOrder(supabase: SupabaseClient, orderId: string): Promise<TicketOrder | null> {
  const base =
    "id, order_number, status, total_price, created_at, ready_at, completed_at, team_name, needed_by, notes, custom_order_items (id, garment, color, size, quantity, unit_price), payments (id, amount, status, method, created_at";
  const run = (providers: boolean) =>
    supabase
      .from("custom_orders")
      .select(`${base}${providers ? ", provider_row:payment_providers (name)" : ""})`)
      .eq("id", orderId)
      .maybeSingle<OrderDetailRow>();
  let res = await run(true);
  if (res.error && (res.error.code === "PGRST200" || res.error.code === "42703")) res = await run(false);
  const o = res.data;
  if (!o) return null;
  return {
    ...toOrderSummary(o),
    orderedAt: o.created_at,
    readyAt: o.ready_at,
    completedAt: o.completed_at,
    team: o.team_name,
    neededBy: o.needed_by,
    notes: o.notes,
    lines: (o.custom_order_items ?? []).map((i) => ({
      key: i.id,
      name: i.garment,
      style: i.color,
      size: i.size,
      quantity: i.quantity,
      price: Number(i.unit_price ?? 0),
    })),
    payments: (o.payments ?? [])
      .filter((p) => p.status === "verified")
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((p) => ({
        key: p.id,
        label: p.method === "cash" ? "Cash" : p.method === "gcash" ? "GCash" : (p.provider_row?.name ?? "E-payment"),
        amount: Number(p.amount),
        at: p.created_at,
      })),
  };
}
