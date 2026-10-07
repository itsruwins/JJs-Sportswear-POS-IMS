import type { SupabaseClient } from "@supabase/supabase-js";
import { moneyOf, type MyPayment, type OrderLine, type OrderStatus, type ReferenceImage, type Step } from "./orders";

/** The file to run in Supabase for request fields, images, and editing. */
export const REQUESTS_MIGRATION = "supabase/migrations/20261013000000_customer_order_requests.sql";

/** Reference image links last a working day, so an open page keeps showing them. */
const SIGNED_FOR = 6 * 60 * 60;

// The request columns arrive with REQUESTS_MIGRATION; until it runs, Postgres answers 42703.
const missingColumn = (e: { code?: string } | null) => e?.code === "42703" || e?.code === "PGRST204";

/** Whether the request migration has run (its columns are there). */
export async function requestsReady(supabase: SupabaseClient) {
  const { error } = await supabase.from("custom_orders").select("team_name", { head: true, count: "exact" }).limit(1);
  return !missingColumn(error);
}

export type MyOrderSummary = {
  id: string;
  order_number: string;
  status: OrderStatus;
  description: string | null;
  team_name: string | null;
  needed_by: string | null;
  total_price: number | null;
  created_at: string;
  garments: string[];
  pieces: number;
  /** Verified and waiting money, for the "pay now" pill. */
  paid: number;
  waiting: number;
};

/** The signed-in customer's orders, newest first (RLS limits the read to their own). */
export async function fetchMyOrders(supabase: SupabaseClient) {
  const run = (full: boolean) =>
    supabase
      .from("custom_orders")
      .select(
        `id, order_number, status, description, total_price, created_at,${full ? " team_name, needed_by," : ""} custom_order_items (garment, quantity), payments (amount, status)`,
      )
      .order("created_at", { ascending: false })
      .limit(200);
  let res = await run(true);
  const migrated = !missingColumn(res.error);
  if (!migrated) res = await run(false);

  type Row = Omit<MyOrderSummary, "garments" | "pieces" | "team_name" | "needed_by" | "total_price"> & {
    team_name?: string | null;
    needed_by?: string | null;
    total_price: number | string | null;
    custom_order_items: { garment: string; quantity: number }[] | null;
    payments: { amount: number | string; status: MyPayment["status"] }[] | null;
  };
  const orders: MyOrderSummary[] = ((res.data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    order_number: r.order_number,
    status: r.status,
    description: r.description,
    team_name: r.team_name ?? null,
    needed_by: r.needed_by ?? null,
    total_price: r.total_price === null ? null : Number(r.total_price),
    created_at: r.created_at,
    garments: [...new Set((r.custom_order_items ?? []).map((i) => i.garment))],
    pieces: (r.custom_order_items ?? []).reduce((sum, i) => sum + i.quantity, 0),
    paid: (r.payments ?? []).filter((p) => p.status === "verified").reduce((sum, p) => sum + Number(p.amount), 0),
    waiting: (r.payments ?? []).filter((p) => p.status === "submitted").reduce((sum, p) => sum + Number(p.amount), 0),
  }));
  return { orders, error: res.error && !missingColumn(res.error) ? res.error : null, migrated };
}

export type MyOrder = {
  id: string;
  order_number: string;
  status: OrderStatus;
  description: string | null;
  notes: string | null;
  team_name: string | null;
  needed_by: string | null;
  total_price: number | null;
  decline_reason: string | null;
  created_at: string;
  lines: OrderLine[];
  references: ReferenceImage[];
  /** False until REQUESTS_MIGRATION has run (no team, date, images, or editing yet). */
  migrated: boolean;
  accepted_at: string | null;
  ready_at: string | null;
  completed_at: string | null;
  steps: Partial<Record<Step, string>>;
  photos: { id: string; url: string | null }[];
  history: { id: string; status: OrderStatus; note: string | null; created_at: string; byCustomer: boolean }[];
  payments: MyPayment[];
  refunded: number;
  design: { id: string; url: string | null; label: string } | null;
};

export async function fetchMyOrder(supabase: SupabaseClient, id: string): Promise<{ order: MyOrder | null; error: boolean }> {
  const base = `id, order_number, status, description, notes, total_price, decline_reason, created_at, accepted_at, ready_at, completed_at, customer_id,
    custom_order_items (garment, color, size, quantity, notes, created_at),
    ai_design:ai_designs (id, prompt, generated_image_url),
    order_status_history (id, status, note, created_at, changed_by),
    payments (id, payment_type, amount, method, status, gcash_reference, rejection_reason, created_at, verified_at)`;
  const run = (full: boolean) =>
    supabase
      .from("custom_orders")
      .select(full ? `${base}, team_name, needed_by, reference_images` : base)
      .eq("id", id)
      .maybeSingle();
  let res = await run(true);
  const migrated = !missingColumn(res.error);
  if (!migrated) res = await run(false);
  if (res.error) return { order: null, error: true };
  if (!res.data) return { order: null, error: false };

  type Row = {
    id: string;
    order_number: string;
    status: OrderStatus;
    description: string | null;
    notes: string | null;
    total_price: number | string | null;
    decline_reason: string | null;
    created_at: string;
    accepted_at: string | null;
    ready_at: string | null;
    completed_at: string | null;
    customer_id: string;
    team_name?: string | null;
    needed_by?: string | null;
    reference_images?: string[] | null;
    custom_order_items: (OrderLine & { created_at: string })[] | null;
    order_status_history: { id: string; status: OrderStatus; note: string | null; created_at: string; changed_by: string }[] | null;
    payments: (Omit<MyPayment, "amount" | "last4"> & { amount: number | string; gcash_reference: string | null })[] | null;
    ai_design: { id: string; prompt: string; generated_image_url: string | null } | null;
  };
  const r = res.data as unknown as Row;

  // Steps, finished photos, and refunds live in their own tables (production and payment migrations).
  const [stepsRes, photosRes, refundsRes] = await Promise.all([
    supabase.from("custom_order_steps").select("step, done_at").eq("order_id", id),
    supabase.from("custom_order_photos").select("id, path, created_at").eq("order_id", id).order("created_at"),
    supabase.from("custom_order_refunds").select("amount").eq("order_id", id),
  ]);

  const paths = r.reference_images ?? [];
  const photoRows = (photosRes.data ?? []) as { id: string; path: string }[];
  const [signed, signedPhotos] = await Promise.all([
    paths.length ? supabase.storage.from("order-references").createSignedUrls(paths, SIGNED_FOR) : null,
    photoRows.length ? supabase.storage.from("order-photos").createSignedUrls(photoRows.map((p) => p.path), SIGNED_FOR) : null,
  ]);
  const urlFor = new Map((signed?.data ?? []).map((s) => [s.path, s.signedUrl]));
  const photoUrl = new Map((signedPhotos?.data ?? []).map((s) => [s.path, s.signedUrl]));

  // The attached studio design lives in the private ai-designs bucket.
  let designUrl: string | null = r.ai_design?.generated_image_url ?? null;
  if (designUrl && !/^https?:\/\//.test(designUrl)) {
    const { data: d } = await supabase.storage.from("ai-designs").createSignedUrl(designUrl, SIGNED_FOR);
    designUrl = d?.signedUrl ?? null;
  }

  const steps: MyOrder["steps"] = {};
  for (const s of (stepsRes.data ?? []) as { step: Step; done_at: string }[]) steps[s.step] = s.done_at;

  return {
    order: {
      id: r.id,
      order_number: r.order_number,
      status: r.status,
      description: r.description,
      notes: r.notes,
      team_name: r.team_name ?? null,
      needed_by: r.needed_by ?? null,
      total_price: r.total_price === null ? null : Number(r.total_price),
      decline_reason: r.decline_reason,
      created_at: r.created_at,
      lines: (r.custom_order_items ?? [])
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map(({ garment, color, size, quantity, notes }) => ({ garment, color, size: size ?? "One size", quantity, notes })),
      references: paths.map((path) => ({ path, url: urlFor.get(path) ?? null })),
      migrated,
      accepted_at: r.accepted_at,
      ready_at: r.ready_at,
      completed_at: r.completed_at,
      steps,
      photos: photoRows.map((p) => ({ id: p.id, url: photoUrl.get(p.path) ?? null })),
      history: (r.order_status_history ?? [])
        .map((h) => ({ id: h.id, status: h.status, note: h.note, created_at: h.created_at, byCustomer: h.changed_by === r.customer_id }))
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
      payments: (r.payments ?? [])
        .map(({ gcash_reference, amount, ...p }) => ({ ...p, amount: Number(amount), last4: gcash_reference ? gcash_reference.slice(-4) : null }))
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      refunded: ((refundsRes.data ?? []) as { amount: number | string }[]).reduce((sum, f) => sum + Number(f.amount), 0),
      design: r.ai_design ? { id: r.ai_design.id, url: designUrl, label: "Design from the studio" } : null,
    },
    error: false,
  };
}

/** What's paid, waiting, and still due on an order (see moneyOf). */
export const moneyFor = (o: Pick<MyOrder, "total_price" | "payments">) => moneyOf(o.total_price, o.payments);
