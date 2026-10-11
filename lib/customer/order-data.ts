import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderLine, OrderStatus, ReferenceImage } from "./orders";

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
};

/** The signed-in customer's orders, newest first (RLS limits the read to their own). */
export async function fetchMyOrders(supabase: SupabaseClient) {
  const run = (full: boolean) =>
    supabase
      .from("custom_orders")
      .select(
        `id, order_number, status, description, total_price, created_at,${full ? " team_name, needed_by," : ""} custom_order_items (garment, quantity)`,
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
};

export async function fetchMyOrder(supabase: SupabaseClient, id: string): Promise<{ order: MyOrder | null; error: boolean }> {
  const base = `id, order_number, status, description, notes, total_price, decline_reason, created_at,
    custom_order_items (garment, color, size, quantity, notes, created_at)`;
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
    team_name?: string | null;
    needed_by?: string | null;
    reference_images?: string[] | null;
    custom_order_items: (OrderLine & { created_at: string })[] | null;
  };
  const r = res.data as unknown as Row;

  const paths = r.reference_images ?? [];
  const signed = paths.length ? await supabase.storage.from("order-references").createSignedUrls(paths, SIGNED_FOR) : null;
  const urlFor = new Map((signed?.data ?? []).map((s) => [s.path, s.signedUrl]));

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
    },
    error: false,
  };
}
