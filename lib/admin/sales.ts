import type { SupabaseClient } from "@supabase/supabase-js";

export type PaymentMethod = "cash" | "gcash";

type Person = { username: string; full_name: string | null } | null;

export type SaleSummary = {
  id: string;
  receipt_number: string;
  subtotal: number;
  amount_paid: number;
  change_amount: number;
  payment_method: PaymentMethod;
  created_at: string;
  gcash_reference: string | null;
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
};

export const METHOD_LABEL: Record<PaymentMethod, string> = { cash: "Cash", gcash: "GCash" };

// The GCash and void columns arrive with supabase/migrations/20261007000000_pos_gcash_and_voids.sql.
// Until it has run, reads fall back to the original columns (Postgres reports 42703, unknown column).
const EXTRA = "gcash_reference, voided_at";
const missingColumn = (e: { code?: string } | null) => e?.code === "42703" || e?.code === "PGRST204";

type Row = {
  id: string;
  receipt_number: string;
  subtotal: number | string;
  amount_paid: number | string;
  change_amount: number | string;
  payment_method: PaymentMethod;
  created_at: string;
  gcash_reference?: string | null;
  voided_at?: string | null;
  void_reason?: string | null;
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

/** Sales between two timestamps, newest first (fromIso may be empty for "since the start"). */
export async function fetchSales(supabase: SupabaseClient, fromIso: string, toIso: string, limit = 300) {
  const run = (extra: boolean) => {
    let q = supabase
      .from("sales")
      .select(
        `id, receipt_number, subtotal, amount_paid, change_amount, payment_method, created_at, ${extra ? `${EXTRA}, ` : ""}cashier:profiles!sales_cashier_id_fkey (username, full_name), sale_items (quantity, variant:product_variants (product:products (name)))`,
      )
      .lt("created_at", toIso);
    if (fromIso) q = q.gte("created_at", fromIso);
    return q.order("created_at", { ascending: false }).limit(limit + 1);
  };
  let res = await run(true);
  if (missingColumn(res.error)) res = await run(false);
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
      created_at: r.created_at,
      gcash_reference: r.gcash_reference ?? null,
      voided_at: r.voided_at ?? null,
      cashier: r.cashier,
      pieces: items.reduce((s, i) => s + i.quantity, 0),
      itemNames: [...new Set(items.map((i) => i.variant?.product?.name ?? "Removed product"))],
    };
  });
  return { sales, more: rows.length > limit, error: null };
}

export type SalesTotals = { count: number; total: number; cash: number; gcash: number; voided: number };

/**
 * Totals for every sale between two timestamps (voided sales counted apart), read page by page
 * after the last id seen, so they don't stop at the list's 300-row cap.
 */
export async function fetchSalesTotals(supabase: SupabaseClient, fromIso: string, toIso: string) {
  const totals: SalesTotals = { count: 0, total: 0, cash: 0, gcash: 0, voided: 0 };
  let extra = true;
  let afterId = "";
  for (let i = 0; i < 100; i++) {
    let q = supabase
      .from("sales")
      .select(extra ? "id, subtotal, payment_method, voided_at" : "id, subtotal, payment_method")
      .lt("created_at", toIso);
    if (fromIso) q = q.gte("created_at", fromIso);
    if (afterId) q = q.gt("id", afterId);
    const { data, error } = await q.order("id").limit(1000);
    if (missingColumn(error) && extra) {
      extra = false;
      i--;
      continue;
    }
    if (error) return { totals, error };
    const rows = (data ?? []) as unknown as { id: string; subtotal: number | string; payment_method: PaymentMethod; voided_at?: string | null }[];
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
      totals[r.payment_method] += amount;
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return { totals: { ...totals, total: round(totals.total), cash: round(totals.cash), gcash: round(totals.gcash) }, error: null };
}

/** One sale with its lines, for the receipt. */
export async function fetchSale(supabase: SupabaseClient, id: string) {
  const run = (extra: boolean) =>
    supabase
      .from("sales")
      .select(
        `id, receipt_number, subtotal, amount_paid, change_amount, payment_method, created_at, ${
          extra ? `${EXTRA}, void_reason, voided_by_profile:profiles!sales_voided_by_fkey (username, full_name), ` : ""
        }cashier:profiles!sales_cashier_id_fkey (username, full_name), sale_items (id, quantity, unit_price, subtotal, variant:product_variants (size, color, sku, product:products (name)))`,
      )
      .eq("id", id)
      .maybeSingle();
  let res = await run(true);
  if (missingColumn(res.error) || res.error?.code === "PGRST200") res = await run(false);
  if (res.error) return { sale: null, error: res.error };
  if (!res.data) return { sale: null, error: null };

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
    created_at: r.created_at,
    gcash_reference: r.gcash_reference ?? null,
    voided_at: r.voided_at ?? null,
    void_reason: r.void_reason ?? null,
    voided_by: r.voided_by_profile ?? null,
    cashier: r.cashier,
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
  const d = ref.replace(/\D/g, "");
  return [d.slice(0, 4), d.slice(4, 7), d.slice(7)].filter(Boolean).join(" ");
}
