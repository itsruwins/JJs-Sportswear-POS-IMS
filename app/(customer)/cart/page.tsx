import type { Metadata } from "next";
import { LiveRefresh } from "@/features/shared/ui/live-refresh";
import { CartView } from "@/features/customer/cart/components/cart-view";
import { fetchCart } from "@/features/customer/cart/data";
import { fetchOpenTickets } from "@/features/customer/tickets/data";
import { requireCustomer } from "@/features/customer/shell/session";

export const metadata: Metadata = { title: "Cart · J&J Sportswear" };

// Stock and prices change under a cart; the page follows them.
const LIVE_TABLES = ["products", "product_variants"] as const;

export default async function CartPage() {
  const { supabase, profile } = await requireCustomer();
  const [{ lines, error, missing }, openTickets] = await Promise.all([fetchCart(supabase, profile.id), fetchOpenTickets(supabase, profile.id)]);
  return (
    <>
      <LiveRefresh tables={LIVE_TABLES} />
      <CartView lines={lines} problem={missing ? "missing" : error ? "error" : null} openTickets={openTickets} />
    </>
  );
}
