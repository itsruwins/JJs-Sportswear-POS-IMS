import type { SupabaseClient } from "@supabase/supabase-js";
import { downPayment, type OrderStatus } from "@/features/admin/orders/data";
import { formatReference, GCASH } from "@/features/shared/payments/model";

export type PayStatus = "pending" | "submitted" | "verified" | "rejected";
/** How a custom-order payment was made: "gcash" only on payments read before providers. */
export type PayMethod = "cash" | "e_payment" | "gcash";
/** How a refund was given back (refunds keep their own method). */
export type RefundMethod = "cash" | "gcash";
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
  provider: string | null;
  providerName: string | null;
  reference: string | null;
  proof_path: string | null;
  note: string | null;
  rejection_reason: string | null;
  verified_at: string | null;
  created_at: string;
  verifier: { username: string; full_name: string | null } | null;
};

// Providers on payments arrive with supabase/migrations/20261019000000_custom_order_e_payments.sql; reads
// before it fall back (withNote = false drops both the note and the providers).
const PAYMENT_COLUMNS = (withNote: boolean) =>
  `id, order_id, payment_type, amount, method, status, gcash_reference, gcash_screenshot_url, ${
    withNote ? "note, provider, reference, provider_row:payment_providers (name), " : ""
  }rejection_reason, verified_at, created_at, verifier:profiles!payments_verified_by_fkey (username, full_name)`;

type PaymentRow = Omit<Payment, "amount" | "proof_path" | "note" | "provider" | "providerName" | "reference"> & {
  amount: number | string;
  gcash_screenshot_url: string | null;
  note?: string | null;
  provider?: string | null;
  reference?: string | null;
  provider_row?: { name: string } | null;
};
const toPayment = ({ provider_row, ...r }: PaymentRow): Payment => {
  const legacy = r.method === "gcash" || (!r.provider && !!r.gcash_reference);
  return {
    ...r,
    amount: Number(r.amount),
    proof_path: r.gcash_screenshot_url,
    note: r.note ?? null,
    provider: r.provider ?? (legacy ? GCASH : null),
    providerName: provider_row?.name ?? (legacy ? "GCash" : null),
    reference: r.reference ?? r.gcash_reference ?? null,
  };
};

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
  refunds: { id: string; amount: number; method: RefundMethod; note: string; created_at: string; by: string }[];
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
  type RefundRow = { id: string; amount: number | string; method: RefundMethod; note: string; created_at: string; actor: { username: string; full_name: string | null } | null };
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

/** "Cash", or "GCash · 1234 567 890123" ("Maya · …9B04" when short). */
export function methodLine(p: Pick<Payment, "method" | "provider" | "providerName" | "reference">, short = false) {
  if (p.method === "cash") return "Cash";
  const name = p.providerName ?? "E-payment";
  if (!p.reference) return name;
  return short ? `${name} · ${p.reference.slice(-4)}` : `${name} · ${formatReference(p.provider, p.reference)}`;
}

// ---------------------------------------------------------------------------------------------
// Counter e-payments: what the cashier took at the POS, waiting for the owner to match each one
// against the shop's bank or e-wallet (supabase/migrations/20261018000000_e_payment_checks.sql).
// ---------------------------------------------------------------------------------------------

export const COUNTER_MIGRATION = "supabase/migrations/20261018000000_e_payment_checks.sql";

export type CounterView = "cashier_confirmed" | "matched" | "disputed";
export const COUNTER_VIEWS: { id: CounterView; label: string }[] = [
  { id: "cashier_confirmed", label: "To check" },
  { id: "matched", label: "Matched" },
  { id: "disputed", label: "Disputed" },
];

/** Why a counter e-payment deserves a closer look, most telling first. */
export type CounterFlag =
  | { kind: "typed" }
  | { kind: "amount_changed"; receipt: number; approver: string | null; reason: string | null }
  | { kind: "reference_changed"; receipt: string }
  | { kind: "suspicious" }
  | { kind: "not_successful"; status: string }
  | { kind: "old_receipt"; date: string }
  | { kind: "photo_quality" };

export type CounterPayment = {
  id: string;
  saleId: string;
  receiptNumber: string;
  saleAt: string;
  cashier: { username: string; full_name: string | null } | null;
  provider: string;
  providerName: string;
  reference: string | null;
  amount: number;
  check: CounterView;
  checkedAt: string | null;
  checkNote: string | null;
  checker: { username: string; full_name: string | null } | null;
  /** A signed link to the receipt photo while it's kept (90 days). */
  photoUrl: string | null;
  photoExpired: boolean;
  recipient: string | null;
  flags: CounterFlag[];
};

type PersonRow = { username: string; full_name: string | null } | null;
type CounterRow = {
  id: string;
  provider: string;
  reference: string | null;
  amount: number | string;
  entry: "scan" | "typed" | null;
  receipt_amount: number | string | null;
  receipt_reference: string | null;
  check_status: CounterView;
  checked_at: string | null;
  check_note: string | null;
  provider_row: { name: string } | null;
  checker: PersonRow;
  sale: { id: string; receipt_number: string; created_at: string; cashier: PersonRow } | null;
  scan: { photo_path: string | null; photo_deleted_at: string | null; reading: { fields?: Record<string, unknown>; problems?: string[] } | null } | null;
  override: { reason: string; approver: PersonRow } | null;
};

const manilaDay = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const who = (p: PersonRow) => p?.full_name?.trim() || (p ? `@${p.username}` : null);

function flagsOf(r: CounterRow): CounterFlag[] {
  const out: CounterFlag[] = [];
  const fields = r.scan?.reading?.fields ?? {};
  const problems = r.scan?.reading?.problems ?? [];
  if (r.entry !== "scan") out.push({ kind: "typed" });
  if (r.receipt_amount !== null && Number(r.receipt_amount) !== Number(r.amount)) {
    out.push({ kind: "amount_changed", receipt: Number(r.receipt_amount), approver: who(r.override?.approver ?? null), reason: r.override?.reason ?? null });
  }
  if (r.receipt_reference && r.reference && r.receipt_reference !== r.reference) out.push({ kind: "reference_changed", receipt: r.receipt_reference });
  if (problems.includes("looks_edited") || problems.includes("instructions_in_image")) out.push({ kind: "suspicious" });
  if (typeof fields.status === "string" && fields.status !== "successful") out.push({ kind: "not_successful", status: fields.status });
  if (typeof fields.date === "string" && r.sale && fields.date !== manilaDay(r.sale.created_at)) out.push({ kind: "old_receipt", date: fields.date });
  if (problems.some((p) => p === "blurry" || p === "glare" || p === "cropped")) out.push({ kind: "photo_quality" });
  return out;
}

/**
 * Counter e-payments for the owner's checks, with what each scan showed. To check lists the ones
 * with something to look at first, then the oldest; the checked views list the latest first.
 */
export async function fetchCounterPayments(supabase: SupabaseClient, view: CounterView) {
  const [res, ...tallies] = await Promise.all([
    supabase
      .from("sale_payments")
      .select(
        `id, provider, reference, amount, entry, receipt_amount, receipt_reference, check_status, checked_at, check_note,
         provider_row:payment_providers (name),
         checker:profiles!sale_payments_checked_by_fkey (username, full_name),
         sale:sales!sale_payments_sale_id_fkey (id, receipt_number, created_at, cashier:profiles!sales_cashier_id_fkey (username, full_name)),
         scan:receipt_scans!sale_payments_scan_id_fkey (photo_path, photo_deleted_at, reading),
         override:payment_overrides!sale_payments_override_id_fkey (reason, approver:profiles!payment_overrides_approved_by_fkey (username, full_name))`,
      )
      .eq("method", "e_payment")
      .eq("check_status", view)
      .is("voided_at", null)
      .order(view === "cashier_confirmed" ? "created_at" : "checked_at", { ascending: view === "cashier_confirmed" })
      .limit(201),
    ...COUNTER_VIEWS.map((v) =>
      supabase.from("sale_payments").select("id", { count: "exact", head: true }).eq("method", "e_payment").eq("check_status", v.id).is("voided_at", null),
    ),
  ]);
  const counts = Object.fromEntries(COUNTER_VIEWS.map((v, i) => [v.id, tallies[i].count ?? 0])) as Record<CounterView, number>;
  if (res.error) return { rows: [] as CounterPayment[], counts, more: false, error: res.error, outdated: notMigrated(res.error) };

  const raw = (res.data ?? []) as unknown as CounterRow[];
  const paths = raw.map((r) => (r.scan?.photo_path && !r.scan.photo_deleted_at ? r.scan.photo_path : null)).filter((p): p is string => !!p);
  const signed = paths.length ? await supabase.storage.from("pos-receipts").createSignedUrls(paths, 60 * 60) : { data: [] };
  const urls = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));

  let rows: CounterPayment[] = raw.slice(0, 200).map((r) => ({
    id: r.id,
    saleId: r.sale?.id ?? "",
    receiptNumber: r.sale?.receipt_number ?? "Unknown sale",
    saleAt: r.sale?.created_at ?? "",
    cashier: r.sale?.cashier ?? null,
    provider: r.provider,
    providerName: r.provider_row?.name ?? r.provider,
    reference: r.reference,
    amount: Number(r.amount),
    check: r.check_status,
    checkedAt: r.checked_at,
    checkNote: r.check_note,
    checker: r.checker,
    photoUrl: r.scan?.photo_path ? (urls.get(r.scan.photo_path) ?? null) : null,
    photoExpired: !!r.scan?.photo_deleted_at,
    recipient: typeof r.scan?.reading?.fields?.recipient === "string" ? (r.scan.reading.fields.recipient as string) : null,
    flags: flagsOf(r),
  }));
  // Something to look at first; otherwise the order the database gave (oldest first).
  if (view === "cashier_confirmed") rows = rows.map((r, i) => ({ r, i })).sort((a, b) => Number(b.r.flags.length > 0) - Number(a.r.flags.length > 0) || a.i - b.i).map((x) => x.r);
  return { rows, counts, more: raw.length > 200, error: null, outdated: false };
}

/** How many counter e-payments wait for the owner's check (0 before the update). */
export async function countCounterToCheck(supabase: SupabaseClient) {
  const { count } = await supabase
    .from("sale_payments")
    .select("id", { count: "exact", head: true })
    .eq("method", "e_payment")
    .eq("check_status", "cashier_confirmed")
    .is("voided_at", null);
  return count ?? 0;
}
