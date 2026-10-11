import type { Metadata } from "next";
import { ShopView } from "@/components/customer/shop/shop-view";
import { readQuery } from "@/lib/customer/catalog";
import { fetchShop } from "@/lib/customer/shop-data";
import { requireCustomer } from "@/lib/customer/session";

export const metadata: Metadata = { title: "Shop · J&J Sportswear" };

export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  const { supabase } = await requireCustomer();
  const query = readQuery(await searchParams);
  const { products, error } = await fetchShop(supabase);
  return <ShopView products={products} error={Boolean(error)} query={query} />;
}
