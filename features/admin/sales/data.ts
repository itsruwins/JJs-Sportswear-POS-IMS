import type { SupabaseClient } from "@supabase/supabase-js";
import { formatReference, GCASH, type CheckStatus, type PartMethod, type SaleMethod } from "@/features/shared/payments/model";

type Person = { username: string; full_name: string | null } | null;

/** One part of a sale's payment: cash, or an e-payment with its provider and reference. */
export type SalePayment = {
  method: PartMethod;
  provider: string | null;
  providerName: string | null;
  reference: string | null;
  amount: number;
  check: CheckStatus | null;
};

export type SaleSummary = {
  id: string;
  receipt_number: string;
  subtotal: number;
  amount_paid: number;
  change_amount: number;
  payment_method: SaleMethod;
  payments: SalePayment[];
  created_at: string;
  voided_at: string | null;
  cashier: Person;
  /** Pieces sold and the first few item names, for the list. */
  pieces: number;
  itemNames: string[];
};

export type SaleLine = {
  id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  size: string | null;
  color: string | null;
  sku: string | null;
  productName: string;
};

export type SaleDetail = Omit<SaleSummary, "pieces" | "itemNames"> & {
  void_reason: string | null;
  voided_by: Person;
  lines: SaleLine[];
  /** The customer's counter ticket this sale paid, if it came from one. */
  ticketCode: string | null;
};

// Reads ask for the newest columns first and step back when the database is older (Postgres reports
// 42703 for an unknown column; PostgREST PGRST200 for an unknown table to embed):
//   2  payment parts, from supabase/migrations/20261016120000_e_payments.sql
//   1  GCash reference and voids, from supabase/migrations/20261007000000_pos_gcash_and_voids.sql
//   0  the original columns
type Level = 0 | 1 | 2;
const EXTRA = "gcash_reference, voided_at";
const PAYMENTS = "sale_payments (position, method, provider, reference, amount, check_status, provider_row:payment_providers (name))";
const columns = (level: Level) => (level === 2 ? `${EXTRA}, ${PAYMENTS}, ` : level === 1 ? `${EXTRA}, ` : "");
const olderSchema = (e: { code?: string } | null) => e?.code === "42703" || e?.code === "PGRST204" || e?.code === "PGRST200";

type PaymentRow = {
  position: number;
  method: PartMethod;
  provider: string | null;
  reference: string | null;
  amount: number | string;
  check_status: CheckStatus | null;
  provider_row: { name: string } | null;
};

type Row = {
  id: string;
  receipt_number: string;
  subtotal: number | string;
  amount_paid: number | string;
  change_amount: number | string;
  payment_method: SaleMethod;
  created_at: string;
  gcash_reference?: string | null;
  voided_at?: string | null;
  void_reason?: string | null;
  sale_payments?: PaymentRow[] | null;
  cashier: Person;
  voided_by_profile?: Person;
};

function money(r: Row) {
  return {
    subtotal: Number(r.subtotal),
    amount_paid: Number(r.amount_paid),
    change_amount: Number(r.change_amount),
  };
}

/** The sale's payment parts in order; a sale read from an older database gets the one it implies. */
function paymentsOf(r: Pick<Row, "payment_method" | "amount_paid" | "gcash_reference" | "sale_payments">): SalePayment[] {
  if (r.sale_payments?.length) {
    return [...r.sale_payments]
      .sort((a, b) => a.position - b.position)
      .map((p) => ({
        method: p.method,
        provider: p.provider,
        providerName: p.provider_row?.name ?? p.provider,
        reference: p.reference,
        amount: Number(p.amount),
        check: p.check_status,
      }));
  }
  const amount = Number(r.amount_paid);
  if (r.payment_method === "gcash" || r.payment_method === "e_payment") {
    return [{ method: "e_payment", provider: GCASH, providerName: "GCash", reference: r.gcash_reference ?? null, amount, check: "cashier_confirmed" }];
  }
  return [{ method: "cash", provider: null, providerName: null, reference: null, amount, check: null }];
}

/** "Cash", "GCash", "Cash + Maya": how a sale was paid, in a few words. */
export function paymentName(payments: SalePayment[]) {
  const names = payments.map((p) => (p.method === "cash" ? "Cash" : (p.providerName ?? "E-payment")));
  return [...new Set(names)].join(" + ") || "Cash";
}

/** Sales between two timestamps, newest first (fromIso may be empty for "since the start"). */
export async function fetchSales(supabase: SupabaseClient, fromIso: string, toIso: string, limit = 300) {
  const run = (level: Level) => {
    let q = supabase
      .from("sales")
      .select(
        `id, receipt_number, subtotal, amount_paid, change_amount, payment_method, created_at, ${columns(level)}cashier:profiles!sales_cashier_id_fkey (username, full_name), sale_items (quantity, variant:product_variants (product:products (name)))`,
      )
      .lt("created_at", toIso);
    if (fromIso) q = q.gte("created_at", fromIso);
    return q.order("created_at", { ascending: false }).limit(limit + 1);
  };
  let res = await run(2);
  if (olderSchema(res.error)) res = await run(1);
  if (olderSchema(res.error)) res = await run(0);
  if (res.error) return { sales: [] as SaleSummary[], more: false, error: res.error };

  type ListRow = Row & { sale_items: { quantity: number; variant: { product: { name: string } | null } | null }[] | null };
  const rows = (res.data ?? []) as unknown as ListRow[];
  const sales: SaleSummary[] = rows.slice(0, limit).map((r) => {
    const items = r.sale_items ?? [];
    return {
      id: r.id,
      receipt_number: r.receipt_number,
      ...money(r),
      payment_method: r.payment_method,
      payments: paymentsOf(r),
      created_at: r.created_at,
      voided_at: r.voided_at ?? null,
      cashier: r.cashier,
      pieces: items.reduce((s, i) => s + i.quantity, 0),
      itemNames: [...new Set(items.map((i) => i.variant?.product?.name ?? "Removed product"))],
    };
  });
  return { sales, more: rows.length > limit, error: null };
}

export type ProviderTotal = { code: string; name: string; amount: number };
export type SalesTotals = { count: number; total: number; cash: number; e_payment: number; providers: ProviderTotal[]; voided: number };

/**
 * Totals for every sale between two timestamps (voided sales counted apart), read page by page
 * after the last id seen, so they don't stop at the list's 300-row cap. E-payments are what was
 * received; cash is the rest of the total, so the two always add up to it.
 */
export async function fetchSalesTotals(supabase: SupabaseClient, fromIso: string, toIso: string) {
  const totals: SalesTotals = { count: 0, total: 0, cash: 0, e_payment: 0, providers: [], voided: 0 };
  const byProvider = new Map<string, ProviderTotal>();
  let level: Level = 2;
  let afterId = "";
  for (let i = 0; i < 100; i++) {
    let q = supabase
      .from("sales")
      .select(
        level === 2
          ? "id, subtotal, payment_method, amount_paid, voided_at, sale_payments (position, method, provider, reference, amount, check_status, provider_row:payment_providers (name))"
          : level === 1
            ? "id, subtotal, payment_method, amount_paid, voided_at"
            : "id, subtotal, payment_method, amount_paid",
      )
      .lt("created_at", toIso);
    if (fromIso) q = q.gte("created_at", fromIso);
    if (afterId) q = q.gt("id", afterId);
    const { data, error } = await q.order("id").limit(1000);
    if (olderSchema(error) && level > 0) {
      level = (level - 1) as Level;
      i--;
      continue;
    }
    if (error) return { totals, error };
    const rows = (data ?? []) as unknown as (Pick<Row, "payment_method" | "amount_paid" | "sale_payments" | "voided_at"> & { id: string; subtotal: number | string })[];
    if (rows.length === 0) break;
    afterId = rows[rows.length - 1].id;
    for (const r of rows) {
      if (r.voided_at) {
        totals.voided += 1;
        continue;
      }
      const amount = Number(r.subtotal);
      totals.count += 1;
      totals.total += amount;
      // An older database has no amounts per part: a GCash sale was paid its exact total.
      const parts = paymentsOf(r.sale_payments?.length ? r : { ...r, amount_paid: amount, gcash_reference: null });
      let epay = 0;
      for (const p of parts) {
        if (p.method !== "e_payment" || !p.provider) continue;
        epay += p.amount;
        const t = byProvider.get(p.provider) ?? { code: p.provider, name: p.providerName ?? p.provider, amount: 0 };
        t.amount += p.amount;
        byProvider.set(p.provider, t);
      }
      totals.e_payment += epay;
      totals.cash += amount - epay;
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    totals: {
      ...totals,
      total: round(totals.total),
      cash: round(totals.cash),
      e_payment: round(totals.e_payment),
      providers: [...byProvider.values()].map((p) => ({ ...p, amount: round(p.amount) })).sort((a, b) => b.amount - a.amount),
    },
    error: null,
  };
}

/**
 * The code of the counter ticket a sale paid, or null. It's kept on the sale itself (from
 * supabase/migrations/20261026000000_ticket_sale_code.sql), so a voided sale still has it;
 * before that update, it's found through the ticket, which only links an unvoided sale.
 * Before the ticket migrations run at all, there's simply none.
 */
async function fetchSaleTicket(supabase: SupabaseClient, saleId: string): Promise<string | null> {
  const own = await supabase.from("sales").select("ticket_code").eq("id", saleId).maybeSingle<{ ticket_code: string | null }>();
  if (!olderSchema(own.error)) return own.data?.ticket_code ?? null;
  const { data } = await supabase.from("counter_tickets").select("code").eq("sale_id", saleId).maybeSingle<{ code: string }>();
  return data?.code ?? null;
}

/** One sale with its lines, for the receipt. */
export async function fetchSale(supabase: SupabaseClient, id: string) {
  const run = (level: Level) =>
    supabase
      .from("sales")
      .select(
        `id, receipt_number, subtotal, amount_paid, change_amount, payment_method, created_at, ${columns(level)}${
          level > 0 ? "void_reason, voided_by_profile:profiles!sales_voided_by_fkey (username, full_name), " : ""
        }cashier:profiles!sales_cashier_id_fkey (username, full_name), sale_items (id, quantity, unit_price, subtotal, variant:product_variants (size, color, sku, product:products (name)))`,
      )
      .eq("id", id)
      .maybeSingle();
  const ticket = fetchSaleTicket(supabase, id);
  let res = await run(2);
  if (olderSchema(res.error)) res = await run(1);
  if (olderSchema(res.error)) res = await run(0);
  if (res.error) return { sale: null, error: res.error };
  if (!res.data) return { sale: null, error: null };
  const ticketCode = await ticket;

  type DetailRow = Row & {
    sale_items:
      | {
          id: string;
          quantity: number;
          unit_price: number | string;
          subtotal: number | string;
          variant: { size: string | null; color: string | null; sku: string | null; product: { name: string } | null } | null;
        }[]
      | null;
  };
  const r = res.data as unknown as DetailRow;
  const sale: SaleDetail = {
    id: r.id,
    receipt_number: r.receipt_number,
    ...money(r),
    payment_method: r.payment_method,
    payments: paymentsOf(r),
    created_at: r.created_at,
    voided_at: r.voided_at ?? null,
    void_reason: r.void_reason ?? null,
    voided_by: r.voided_by_profile ?? null,
    cashier: r.cashier,
    ticketCode,
    lines: (r.sale_items ?? [])
      .map((i) => ({
        id: i.id,
        quantity: i.quantity,
        unit_price: Number(i.unit_price),
        subtotal: Number(i.subtotal),
        size: i.variant?.size ?? null,
        color: i.variant?.color ?? null,
        sku: i.variant?.sku ?? null,
        productName: i.variant?.product?.name ?? "Removed product",
      }))
      .sort((a, b) => a.productName.localeCompare(b.productName)),
  };
  return { sale, error: null };
}

export function personName(p: Person) {
  return p?.full_name?.trim() || (p ? `@${p.username}` : "Someone");
}

/** "1234 567 890123", the way the GCash app groups a reference. */
export function formatGcashRef(ref: string) {
  return formatReference(GCASH, ref.replace(/\D/g, ""));
}
