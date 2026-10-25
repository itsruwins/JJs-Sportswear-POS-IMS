import type { SupabaseClient } from "@supabase/supabase-js";
import { sortSizes, type CatalogProduct } from "@/features/shared/catalog/catalog";
import { JERSEY_STYLES } from "@/features/shared/catalog/styles";
import type { Design } from "./model";

export const COUNTER_ORDERS_MIGRATION = "supabase/migrations/20261022000000_counter_design_orders.sql";

const styleRank = (name: string) => {
  const i = JERSEY_STYLES.findIndex((s) => s.name === name);
  return i === -1 ? JERSEY_STYLES.length : i;
};

/** The made-to-order products the counter takes orders for: active, with visible styles and sizes. */
export function designsFrom(products: CatalogProduct[]): Design[] {
  return products
    .filter((p) => p.is_active && p.made_to_order)
    .map((p) => {
      const live = p.variants.filter((v) => v.is_active && v.color && v.size);
      const names = [...new Set(live.map((v) => v.color!))].sort((a, b) => styleRank(a) - styleRank(b) || a.localeCompare(b));
      const styles = names.map((name) => {
        const vs = live.filter((v) => v.color === name);
        const order = sortSizes(vs.map((v) => v.size!));
        const variants = vs
          .map((v) => ({ id: v.id, size: v.size!, price: v.price }))
          .sort((a, b) => order.indexOf(a.size) - order.indexOf(b.size));
        return { name, price: Math.min(...variants.map((v) => v.price)), variants };
      });
      const number = live.map((v) => /^D(\d+)-/.exec(v.sku ?? "")?.[1]).find(Boolean);
      return {
        id: p.id,
        name: p.name,
        image: p.image,
        tags: p.tags,
        number: number ? Number(number) : null,
        priceFrom: live.length ? Math.min(...live.map((v) => v.price)) : p.base_price,
        styles,
      };
    })
    .filter((d) => d.styles.length > 0)
    .sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999) || a.name.localeCompare(b.name));
}

export type SlipLine = { id: string; design: string; style: string | null; size: string | null; quantity: number; unitPrice: number | null };
export type SlipPayment = { method: string; provider: string | null; providerName: string | null; reference: string | null; amount: number };
export type CounterOrder = {
  id: string;
  orderNumber: string;
  createdAt: string;
  buyerName: string;
  buyerPhone: string | null;
  team: string | null;
  neededBy: string | null;
  notes: string | null;
  total: number;
  status: string;
  takenBy: { username: string; full_name: string | null } | null;
  lines: SlipLine[];
  payments: SlipPayment[];
  paid: number;
};

type Row = {
  id: string;
  order_number: string;
  created_at: string;
  walk_in_name: string | null;
  walk_in_phone: string | null;
  team_name: string | null;
  needed_by: string | null;
  notes: string | null;
  total_price: number | string | null;
  status: string;
  created_via: string;
  taker: { username: string; full_name: string | null } | null;
  custom_order_items: { id: string; garment: string; color: string | null; size: string | null; quantity: number; unit_price: number | string | null }[];
  payments: { method: string; provider: string | null; reference: string | null; amount: number | string; status: string; created_at: string; provider_row: { name: string } | null }[];
};

/** One counter order, for its slip. Null when it isn't a counter order (or doesn't exist). */
export async function fetchCounterOrder(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("custom_orders")
    .select(
      `id, order_number, created_at, walk_in_name, walk_in_phone, team_name, needed_by, notes, total_price, status, created_via,
       taker:profiles!custom_orders_accepted_by_fkey (username, full_name),
       custom_order_items (id, garment, color, size, quantity, unit_price),
       payments (method, provider, reference, amount, status, created_at, provider_row:payment_providers (name))`,
    )
    .eq("id", id)
    .maybeSingle<Row>();
  if (error) return { order: null, error, outdated: error.code === "42703" };
  if (!data || data.created_via !== "counter") return { order: null, error: null, outdated: false };

  const payments = data.payments
    .filter((p) => p.status === "verified")
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((p) => ({
      method: p.method,
      provider: p.provider,
      providerName: p.provider_row?.name ?? null,
      reference: p.reference,
      amount: Number(p.amount),
    }));
  const sizeOrder = sortSizes([...new Set(data.custom_order_items.map((i) => i.size ?? ""))]);
  const order: CounterOrder = {
    id: data.id,
    orderNumber: data.order_number,
    createdAt: data.created_at,
    buyerName: data.walk_in_name ?? "Walk-in",
    buyerPhone: data.walk_in_phone,
    team: data.team_name,
    neededBy: data.needed_by,
    notes: data.notes,
    total: Number(data.total_price ?? 0),
    status: data.status,
    takenBy: data.taker,
    lines: data.custom_order_items
      .map((i) => ({
        id: i.id,
        design: i.garment,
        style: i.color,
        size: i.size,
        quantity: i.quantity,
        unitPrice: i.unit_price === null ? null : Number(i.unit_price),
      }))
      .sort(
        (a, b) =>
          a.design.localeCompare(b.design) ||
          styleRank(a.style ?? "") - styleRank(b.style ?? "") ||
          sizeOrder.indexOf(a.size ?? "") - sizeOrder.indexOf(b.size ?? ""),
      ),
    payments,
    paid: payments.reduce((s, p) => s + p.amount, 0),
  };
  return { order, error: null, outdated: false };
}
