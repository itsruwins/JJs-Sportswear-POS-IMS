import type { SupabaseClient } from "@supabase/supabase-js";

export type OrderStatus = "pending" | "accepted" | "in_progress" | "ready" | "completed" | "declined" | "cancelled";
export type Step = "printing" | "cutting" | "sewing" | "inspection" | "packing";

export const STEPS: { id: Step; label: string }[] = [
  { id: "printing", label: "Printing" },
  { id: "cutting", label: "Cutting" },
  { id: "sewing", label: "Sewing" },
  { id: "inspection", label: "Inspection" },
  { id: "packing", label: "Folding and packing" },
];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "New",
  accepted: "Accepted",
  in_progress: "In production",
  ready: "Ready for pickup",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
};

/** The list's tabs. "Open" is everything still moving; "Closed" is declined and cancelled. */
export type OrderView = "open" | "pending" | "accepted" | "in_progress" | "ready" | "completed" | "closed" | "all";
export const VIEWS: { id: OrderView; label: string; statuses: OrderStatus[] }[] = [
  { id: "open", label: "Open", statuses: ["pending", "accepted", "in_progress", "ready"] },
  { id: "pending", label: "New", statuses: ["pending"] },
  { id: "accepted", label: "Accepted", statuses: ["accepted"] },
  { id: "in_progress", label: "In production", statuses: ["in_progress"] },
  { id: "ready", label: "Ready", statuses: ["ready"] },
  { id: "completed", label: "Completed", statuses: ["completed"] },
  { id: "closed", label: "Declined or cancelled", statuses: ["declined", "cancelled"] },
  { id: "all", label: "All", statuses: [] },
];

/** The shop asks for at least half before production; rounded up to the peso. */
export const downPayment = (total: number) => Math.ceil(total / 2);

// The reviewed version arrived as a follow-up (the first file was applied before its fixes).
const MIGRATION = "supabase/migrations/20261009120000_custom_order_production_fixes.sql";
/** The list shows the newest 300 orders in a tab; the page says so when there are more. */
const LIST_LIMIT = 300;
/** Photo links last a working day, so a page left open (and refreshed live) keeps showing the same images. */
const SIGNED_FOR = 6 * 60 * 60;
// A table or relationship the production migration adds isn't there yet.
const notMigrated = (e: { code?: string } | null) => e?.code === "PGRST205" || e?.code === "42P01" || e?.code === "PGRST200";

type Person = { id: string; username: string; full_name: string | null; phone: string | null; email: string | null; avatar_url?: string | null } | null;

export type OrderSummary = {
  id: string;
  order_number: string;
  status: OrderStatus;
  total_price: number | null;
  description: string | null;
  created_at: string;
  customer: Person;
  pieces: number;
  garments: string[];
  stepsDone: number;
  /** From the customer request form (customer_order_requests migration); null before it runs. */
  team_name: string | null;
  needed_by: string | null;
};

/** Orders for a view, newest first (new orders first in Open), with a text search over number, customer, and request. */
export async function fetchOrders(supabase: SupabaseClient, view: OrderView, q: string) {
  const statuses = VIEWS.find((v) => v.id === view)?.statuses ?? [];
  const run = (withSteps: boolean) => {
    let query = supabase
      .from("custom_orders")
      .select(
        `id, order_number, status, total_price, description, created_at, customer:profiles!custom_orders_customer_id_fkey (id, username, full_name, phone, email), custom_order_items (garment, quantity)${withSteps ? ", custom_order_steps (step)" : ""}`,
      )
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT + 1);
    if (statuses.length) query = query.in("status", statuses);
    return query;
  };
  let res = await run(true);
  const migrated = !notMigrated(res.error);
  if (!migrated) res = await run(false);
  if (res.error) return { orders: [] as OrderSummary[], more: false, counts: {} as Record<OrderStatus, number>, migrated, error: res.error };

  type Row = {
    id: string;
    order_number: string;
    status: OrderStatus;
    total_price: number | string | null;
    description: string | null;
    created_at: string;
    customer: Person;
    custom_order_items: { garment: string; quantity: number }[] | null;
    custom_order_steps?: { step: Step }[] | null;
  };
  const needle = q.trim().toLowerCase().replace(/^@/, "");
  const rows = (res.data ?? []) as unknown as Row[];
  const more = rows.length > LIST_LIMIT;
  let orders: OrderSummary[] = rows.map((r) => ({
    id: r.id,
    order_number: r.order_number,
    status: r.status,
    total_price: r.total_price === null ? null : Number(r.total_price),
    description: r.description,
    created_at: r.created_at,
    customer: r.customer,
    pieces: (r.custom_order_items ?? []).reduce((s, i) => s + i.quantity, 0),
    garments: [...new Set((r.custom_order_items ?? []).map((i) => i.garment))],
    stepsDone: (r.custom_order_steps ?? []).length,
    team_name: null,
    needed_by: null,
  }));
  // Team and needed-by come with the customer request migration; read them on their own,
  // so the list still loads before it runs.
  if (orders.length) {
    const extra = await supabase.from("custom_orders").select("id, team_name, needed_by").in("id", orders.map((o) => o.id));
    const byId = new Map(((extra.data ?? []) as { id: string; team_name: string | null; needed_by: string | null }[]).map((e) => [e.id, e]));
    orders = orders.map((o) => ({ ...o, team_name: byId.get(o.id)?.team_name ?? null, needed_by: byId.get(o.id)?.needed_by ?? null }));
  }
  if (needle) {
    orders = orders.filter((o) =>
      [o.order_number, o.customer?.username, o.customer?.full_name, o.description, o.team_name, ...o.garments]
        .filter(Boolean)
        .some((t) => t!.toLowerCase().includes(needle)),
    );
  }
  // New orders lead the Open view: they're waiting on the shop.
  if (view === "open") orders.sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"));

  // Exact counts per status (head requests), not a capped list of rows.
  const everyStatus = Object.keys(STATUS_LABEL) as OrderStatus[];
  const tallies = await Promise.all(
    everyStatus.map((s) => supabase.from("custom_orders").select("id", { count: "exact", head: true }).eq("status", s)),
  );
  const counts = Object.fromEntries(everyStatus.map((s, i) => [s, tallies[i].count ?? 0])) as Record<OrderStatus, number>;
  return { orders: orders.slice(0, LIST_LIMIT), more, counts, migrated, error: null };
}

export type OrderDetail = {
  id: string;
  order_number: string;
  status: OrderStatus;
  total_price: number | null;
  description: string | null;
  notes: string | null;
  decline_reason: string | null;
  created_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  completed_at: string | null;
  customer: Person;
  items: { id: string; garment: string; color: string | null; size: string | null; quantity: number; notes: string | null }[];
  design: { prompt: string; image: string | null } | null;
  steps: Partial<Record<Step, { done_at: string; by: string }>>;
  photos: { id: string; path: string; url: string | null }[];
  history: { id: string; status: OrderStatus; note: string | null; created_at: string; by: string }[];
  /** False until the production migration has run: steps and photos aren't available yet. */
  migrated: boolean;
  /** From the customer request form; empty before the customer_order_requests migration runs. */
  team_name: string | null;
  needed_by: string | null;
  references: { path: string; url: string | null }[];
};

const nameOf = (p: { username: string; full_name: string | null } | null) => p?.full_name?.trim() || (p ? `@${p.username}` : "Someone");

/** One order with everything the order page shows. Photos come back as short-lived signed links (the bucket is private). */
export async function fetchOrder(supabase: SupabaseClient, id: string): Promise<{ order: OrderDetail | null; error: string | null }> {
  const { data, error } = await supabase
    .from("custom_orders")
    .select(
      `id, order_number, status, total_price, description, notes, decline_reason, created_at, accepted_at, ready_at, completed_at,
       customer:profiles!custom_orders_customer_id_fkey (id, username, full_name, phone, email, avatar_url),
       custom_order_items (id, garment, color, size, quantity, notes, created_at),
       ai_design:ai_designs (prompt, generated_image_url),
       order_status_history (id, status, note, created_at, actor:profiles (username, full_name))`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return { order: null, error: "We couldn’t load this order just now. Refresh the page to try again." };
  if (!data) return { order: null, error: null };

  const [stepsRes, photosRes, requestRes] = await Promise.all([
    supabase.from("custom_order_steps").select("step, done_at, actor:profiles (username, full_name)").eq("order_id", id),
    supabase.from("custom_order_photos").select("id, path, created_at").eq("order_id", id).order("created_at"),
    // Read on its own: these columns only exist once the customer request migration has run.
    supabase.from("custom_orders").select("team_name, needed_by, reference_images").eq("id", id).maybeSingle(),
  ]);
  const request = (requestRes.data ?? null) as { team_name: string | null; needed_by: string | null; reference_images: string[] | null } | null;
  const refPaths = request?.reference_images ?? [];
  const refSigned = refPaths.length ? await supabase.storage.from("order-references").createSignedUrls(refPaths, SIGNED_FOR) : null;
  const refUrl = new Map((refSigned?.data ?? []).map((s) => [s.path, s.signedUrl]));
  const migrated = !notMigrated(stepsRes.error) && !notMigrated(photosRes.error);

  type Row = {
    id: string;
    order_number: string;
    status: OrderStatus;
    total_price: number | string | null;
    description: string | null;
    notes: string | null;
    decline_reason: string | null;
    created_at: string;
    accepted_at: string | null;
    ready_at: string | null;
    completed_at: string | null;
    customer: Person;
    custom_order_items: (OrderDetail["items"][number] & { created_at: string })[] | null;
    ai_design: { prompt: string; generated_image_url: string | null } | null;
    order_status_history: { id: string; status: OrderStatus; note: string | null; created_at: string; actor: { username: string; full_name: string | null } | null }[] | null;
  };
  const r = data as unknown as Row;

  const steps: OrderDetail["steps"] = {};
  for (const s of (stepsRes.data ?? []) as unknown as { step: Step; done_at: string; actor: { username: string; full_name: string | null } | null }[]) {
    steps[s.step] = { done_at: s.done_at, by: nameOf(s.actor) };
  }

  const photoRows = (photosRes.data ?? []) as { id: string; path: string }[];
  const signed = photoRows.length ? await supabase.storage.from("order-photos").createSignedUrls(photoRows.map((p) => p.path), SIGNED_FOR) : null;
  const urlFor = new Map((signed?.data ?? []).map((s) => [s.path, s.signedUrl]));

  // A design image may be a full link or a path in the private ai-designs bucket.
  let designImage = r.ai_design?.generated_image_url ?? null;
  if (designImage && !/^https?:\/\//.test(designImage)) {
    const { data: d } = await supabase.storage.from("ai-designs").createSignedUrl(designImage, SIGNED_FOR);
    designImage = d?.signedUrl ?? null;
  }

  return {
    order: {
      id: r.id,
      order_number: r.order_number,
      status: r.status,
      total_price: r.total_price === null ? null : Number(r.total_price),
      description: r.description,
      notes: r.notes,
      decline_reason: r.decline_reason,
      created_at: r.created_at,
      accepted_at: r.accepted_at,
      ready_at: r.ready_at,
      completed_at: r.completed_at,
      customer: r.customer,
      items: (r.custom_order_items ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at)),
      design: r.ai_design ? { prompt: r.ai_design.prompt, image: designImage } : null,
      steps,
      photos: photoRows.map((p) => ({ id: p.id, path: p.path, url: urlFor.get(p.path) ?? null })),
      history: (r.order_status_history ?? [])
        .map((h) => ({ id: h.id, status: h.status, note: h.note, created_at: h.created_at, by: nameOf(h.actor) }))
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      migrated,
      team_name: request?.team_name ?? null,
      needed_by: request?.needed_by ?? null,
      references: refPaths.map((path) => ({ path, url: refUrl.get(path) ?? null })),
    },
    error: null,
  };
}

export { MIGRATION as PRODUCTION_MIGRATION };
