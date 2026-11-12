import type { Metadata } from "next";
import { ShopView } from "@/features/customer/shop/components/shop-view";
import { readQuery } from "@/features/customer/shop/model";
import { fetchShop } from "@/features/customer/shop/data";
import { requireCustomer } from "@/features/customer/shell/session";

export const metadata: Metadata = { title: "Shop" };

export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  const { supabase } = await requireCustomer();
  const query = readQuery(await searchParams);
  const { products, error } = await fetchShop(supabase);
  return <ShopView products={products} error={Boolean(error)} query={query} />;
}
