import type { SupabaseClient } from "@supabase/supabase-js";
import type { CartLine } from "./model";

// The cart is the customer's own rows in cart_items (RLS). Variants and products come
// through the shop's own read rules, so an archived item arrives as null. Designs are
// in it too (from 20261027000000_design_tickets.sql); before that, none get added.

type CartRow = {
  variant_id: string;
  quantity: number;
  product_variants: {
    size: string | null;
    color: string | null;
    price: number | string;
    stock_quantity: number;
    low_stock_threshold: number;
    is_active: boolean;
    products: {
      id: string;
      name: string;
      is_active: boolean;
      made_to_order: boolean | null;
      product_images: { image_url: string; is_primary: boolean; created_at: string }[] | null;
    } | null;
  } | null;
};

const CART_SELECT = `
  variant_id, quantity,
  product_variants (
    size, color, price, stock_quantity, low_stock_threshold, is_active,
    products ( id, name, is_active, made_to_order, product_images (image_url, is_primary, created_at) )
  )
`;

/** The table isn't there until the cart migration runs. */
export const cartMissing = (error: { code?: string } | null) => error?.code === "PGRST205" || error?.code === "42P01";

function toLine(r: CartRow): CartLine {
  const v = r.product_variants;
  const p = v?.products;
  const sellable = v && p && v.is_active && p.is_active;
  if (!sellable) return { variantId: r.variant_id, quantity: r.quantity, item: null };
  const photo = [...(p.product_images ?? [])].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.created_at.localeCompare(b.created_at),
  )[0];
  const stock = Math.max(0, v.stock_quantity);
  return {
    variantId: r.variant_id,
    quantity: r.quantity,
    item: {
      productId: p.id,
      name: p.name,
      image: photo?.image_url ?? null,
      size: v.size ?? "One size",
      color: v.color ?? "One color",
      price: Number(v.price),
      stock,
      low: !p.made_to_order && stock > 0 && stock <= v.low_stock_threshold,
      madeToOrder: !!p.made_to_order,
    },
  };
}

/** The customer's cart, oldest line first, each joined to today's price and stock. */
export async function fetchCart(supabase: SupabaseClient, customerId: string) {
  const { data, error } = await supabase
    .from("cart_items")
    .select(CART_SELECT)
    .eq("customer_id", customerId)
    .order("created_at")
    .order("variant_id")
    .returns<CartRow[]>();
  return { lines: (data ?? []).map(toLine), error, missing: cartMissing(error) };
}

/** Quantity in the cart per variant: the product page shows what's already in it. */
export async function fetchCartQuantities(supabase: SupabaseClient, customerId: string) {
  const { data } = await supabase
    .from("cart_items")
    .select("variant_id, quantity")
    .eq("customer_id", customerId)
    .returns<{ variant_id: string; quantity: number }[]>();
  return Object.fromEntries((data ?? []).map((r) => [r.variant_id, r.quantity])) as Record<string, number>;
}

/** Pieces in the cart, for the bag in the top bar. Zero before the migration runs. */
export async function fetchCartCount(supabase: SupabaseClient, customerId: string) {
  const { data } = await supabase.from("cart_items").select("quantity").eq("customer_id", customerId).returns<{ quantity: number }[]>();
  return (data ?? []).reduce((sum, r) => sum + r.quantity, 0);
}
