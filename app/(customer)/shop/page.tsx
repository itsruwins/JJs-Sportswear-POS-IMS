import type { Metadata } from "next";
import { ShopView } from "@/components/customer/tab-views";
import { firstName, greeting, manilaDate, requireCustomer } from "@/lib/customer/session";

export const metadata: Metadata = { title: "Shop · J&J Sportswear" };

export default async function ShopPage() {
  const { supabase, profile } = await requireCustomer();
  const now = new Date();
  // Products with at least one size and color in stock, not just listed ones.
  const { count, error } = await supabase
    .from("products")
    .select("id, product_variants!inner(id)", { count: "exact", head: true })
    .eq("is_active", true)
    .eq("product_variants.is_active", true)
    .gt("product_variants.stock_quantity", 0);

  return (
    <ShopView
      greeting={greeting(now)}
      name={firstName(profile)}
      dateLine={manilaDate(now)}
      products={error ? null : (count ?? 0)}
    />
  );
}
