import type { SupabaseClient } from "@supabase/supabase-js";
import { downPayment, type OrderStatus } from "@/features/admin/orders/data";

export type PayStatus = "pending" | "submitted" | "verified" | "rejected";
export type PayMethod = "cash" | "gcash";
export type PayType = "down_payment" | "balance";

export const PAY_STATUS_LABEL: Record<PayStatus, string> = {
  pending: "Not sent yet",
  submitted: "To review",
  verified: "Verified",
  rejected: "Rejected",
};
export const PAY_TYPE_LABEL: Record<PayType, string> = { down_payment: "Down payment", balance: "Balance" };

export const PAYMENTS_MIGRATION = "supabase/migrations/20261010000000_custom_order_payments.sql";
const notMigrated = (e: { code?: string } | null) => e?.code === "PGRST205" || e?.code === "42P01" || e?.code === "42703" || e?.code === "PGRST200";
const SIGNED_FOR = 6 * 60 * 60;

type Person = { id: string; username: string; full_name: string | null } | null;

export type Payment = {
  id: string;
  order_id: string;
  payment_type: PayType;
  amount: number;
  method: PayMethod;
  status: PayStatus;
  gcash_reference: string | null;
  proof_path: string | null;
  note: string | null;
  rejection_reason: string | null;
  verified_at: string | null;
  created_at: string;
  verifier: { username: string; full_name: string | null } | null;
};

const PAYMENT_COLUMNS = (withNote: boolean) =>
  `id, order_id, payment_type, amount, method, status, gcash_reference, gcash_screenshot_url, ${withNote ? "note, " : ""}rejection_reason, verified_at, created_at, verifier:profiles!payments_verified_by_fkey (username, full_name)`;

type PaymentRow = Omit<Payment, "amount" | "proof_path" | "note"> & { amount: number | string; gcash_screenshot_url: string | null; note?: string | null };
const toPayment = (r: PaymentRow): Payment => ({
  ...r,
  amount: Number(r.amount),
  proof_path: r.gcash_screenshot_url,
  note: r.note ?? null,
});

/** An order's money: what's been paid (verified), what's waiting, refunds, and the owner's exceptions. */
export type OrderMoney = {
  total: number | null;
  paid: number;
  /** Sent by the customer and waiting for review (submitted only; "pending" was never sent). */
  waiting: number;
  /** The oldest payment waiting for review, to link to. */
  waitingId: string | null;
  refunded: number;
  due: number;
  downDue: number;
  downMet: boolean;
  payments: Payment[];
  refunds: { id: string; amount: number; method: PayMethod; note: string; created_at: string; by: string }[];
  overrides: Partial<Record<"production" | "pickup", { reason: string; by: string; at: string }>>;
  /** False until the payments migration has run (recording, refunds, and exceptions need it). */
  migrated: boolean;
};

const nameOf = (p: { username: string; full_name: string | null } | null) => p?.full_name?.trim() || (p ? `@${p.username}` : "Someone");

export async function fetchOrderMoney(supabase: SupabaseClient, orderId: string, total: number | null): Promise<OrderMoney> {
  let payRes = await supabase.from("payments").select(PAYMENT_COLUMNS(true)).eq("order_id", orderId).order("created_at", { ascending: false });
  let migrated = true;
  if (notMigrated(payRes.error)) {
    migrated = false;
    payRes = await supabase.from("payments").select(PAYMENT_COLUMNS(false)).eq("order_id", orderId).order("created_at", { ascending: false });
  }
  const [refRes, ovRes] = await Promise.all([
    supabase.from("custom_order_refunds").select("id, amount, method, note, created_at, actor:profiles (username, full_name)").eq("order_id", orderId).order("created_at"),
    supabase.from("custom_order_overrides").select("kind, reason, created_at, actor:profiles (username, full_name)").eq("order_id", orderId),
  ]);
  if (notMigrated(refRes.error) || notMigrated(ovRes.error)) migrated = false;

  const payments = ((payRes.data ?? []) as unknown as PaymentRow[]).map(toPayment);
  const sum = (list: { amount: number }[]) => Math.round(list.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  const paid = sum(payments.filter((p) => p.status === "verified"));
  const sent = payments.filter((p) => p.status === "submitted");
  const waiting = sum(sent);
  const waitingId = sent.length ? sent[sent.length - 1].id : null; // payments are newest first
  type RefundRow = { id: string; amount: number | string; method: PayMethod; note: string; created_at: string; actor: { username: string; full_name: string | null } | null };
  const refunds = ((refRes.data ?? []) as unknown as RefundRow[]).map((r) => ({ id: r.id, amount: Number(r.amount), method: r.method, note: r.note, created_at: r.created_at, by: nameOf(r.actor) }));
  type OverrideRow = { kind: "production" | "pickup"; reason: string; created_at: string; actor: { username: string; full_name: string | null } | null };
  const overrides: OrderMoney["overrides"] = {};
  for (const o of (ovRes.data ?? []) as unknown as OverrideRow[]) overrides[o.kind] = { reason: o.reason, by: nameOf(o.actor), at: o.created_at };
  const downDue = total !== null ? downPayment(total) : 0;

  return {
    total,
    paid,
    waiting,
    waitingId,
    refunded: sum(refunds),
    due: total !== null ? Math.max(0, Math.round((total - paid) * 100) / 100) : 0,
    downDue,
    downMet: total !== null && paid >= downDue,
    payments,
    refunds,
    overrides,
    migrated,
  };
}

export type QueueView = "submitted" | "verified" | "rejected" | "all";
export const QUEUE_VIEWS: { id: QueueView; label: string }[] = [
  { id: "submitted", label: "To review" },
  { id: "verified", label: "Verified" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
];

export type QueueRow = Payment & { order_number: string; order_status: OrderStatus; customer: Person };

/** Payments for the queue: newest first (oldest first while reviewing, so nobody waits longest). */
export async function fetchPaymentQueue(supabase: SupabaseClient, view: QueueView) {
  const run = (withNote: boolean) => {
    let q = supabase
      .from("payments")
      .select(`${PAYMENT_COLUMNS(withNote)}, order:custom_orders (order_number, status, customer:profiles!custom_orders_customer_id_fkey (id, username, full_name))`)
      .order("created_at", { ascending: view === "submitted" })
      .limit(301);
    if (view !== "all") q = q.eq("status", view);
    return q;
  };
  let res = await run(true);
  if (notMigrated(res.error)) res = await run(false);
  const tallies = await Promise.all(
    (["submitted", "verified", "rejected"] as const).map((s) =>
      supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", s),
    ),
  );
  const counts = { submitted: tallies[0].count ?? 0, verified: tallies[1].count ?? 0, rejected: tallies[2].count ?? 0 };
  if (res.error) return { rows: [] as QueueRow[], more: false, counts, error: res.error };

  type Row = PaymentRow & { order: { order_number: string; status: OrderStatus; customer: Person } | null };
  const rows = ((res.data ?? []) as unknown as Row[]).map((r) => ({
    ...toPayment(r),
    order_number: r.order?.order_number ?? "Unknown order",
    order_status: r.order?.status ?? "pending",
    customer: r.order?.customer ?? null,
  }));
  return { rows: rows.slice(0, 300), more: rows.length > 300, counts, error: null };
}

export type PaymentDetail = Payment & {
  order: { id: string; order_number: string; status: OrderStatus; total_price: number | null; customer: Person };
  proofUrl: string | null;
  /** Verified before this one (this one excluded), so the page can show where it lands. */
  paidBefore: number;
};

export async function fetchPayment(supabase: SupabaseClient, id: string): Promise<{ payment: PaymentDetail | null; error: string | null }> {
  const run = (withNote: boolean) =>
    supabase
      .from("payments")
      .select(`${PAYMENT_COLUMNS(withNote)}, order:custom_orders (id, order_number, status, total_price, customer:profiles!custom_orders_customer_id_fkey (id, username, full_name))`)
      .eq("id", id)
      .maybeSingle();
  let res = await run(true);
  if (notMigrated(res.error)) res = await run(false);
  if (res.error) return { payment: null, error: "We couldn’t load this payment just now. Refresh the page to try again." };
  if (!res.data) return { payment: null, error: null };

  type Row = PaymentRow & { order: { id: string; order_number: string; status: OrderStatus; total_price: number | string | null; customer: Person } };
  const r = res.data as unknown as Row;
  const p = toPayment(r);
  const [{ data: others }, signed] = await Promise.all([
    supabase.from("payments").select("id, amount, verified_at, created_at").eq("order_id", r.order.id).eq("status", "verified"),
    p.proof_path ? supabase.storage.from("payment-proofs").createSignedUrl(p.proof_path, SIGNED_FOR) : Promise.resolve({ data: null }),
  ]);
  // A verified slip shows the order as it stood then, so a reprint doesn't count later payments.
  type Other = { id: string; amount: number | string; verified_at: string | null; created_at: string };
  const t = (iso: string | null) => (iso ? Date.parse(iso) : 0);
  const earlier = (o: Other) => {
    const a = [t(o.verified_at), t(o.created_at)], b = [t(p.verified_at), t(p.created_at)];
    return a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : o.id < id;
  };
  const paidBefore = ((others ?? []) as Other[])
    .filter((o) => o.id !== id && (p.status !== "verified" || earlier(o)))
    .reduce((s, o) => s + Number(o.amount), 0);
  return {
    payment: {
      ...p,
      order: { ...r.order, total_price: r.order.total_price === null ? null : Number(r.order.total_price) },
      proofUrl: (signed as { data: { signedUrl: string } | null }).data?.signedUrl ?? null,
      paidBefore: Math.round(paidBefore * 100) / 100,
    },
    error: null,
  };
}

/** "Cash", or "GCash · 1234 567 890123". */
export function methodLine(p: Pick<Payment, "method" | "gcash_reference">, short = false) {
  if (p.method === "cash") return "Cash";
  if (!p.gcash_reference) return "GCash";
  const d = p.gcash_reference;
  return short ? `GCash · ${d.slice(-4)}` : `GCash · ${[d.slice(0, 4), d.slice(4, 7), d.slice(7)].join(" ")}`;
}
