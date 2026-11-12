import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageShell } from "@/features/customer/shell/components/page-parts";
import { ProductView } from "@/features/customer/shop/components/product-view";
import { fetchShop } from "@/features/customer/shop/data";
import { fetchCartQuantities } from "@/features/customer/cart/data";
import { requireCustomer } from "@/features/customer/shell/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/shop/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Shop" };
  const { supabase } = await requireCustomer();
  const { data } = await supabase.from("products").select("name").eq("id", id).maybeSingle<{ name: string }>();
  return { title: data?.name ?? "Shop" };
}

export default async function ProductPage({ params }: PageProps<"/shop/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { supabase, profile } = await requireCustomer();

  // One catalog read serves the product and its "more like this" row.
  const [{ products, error }, inCart] = await Promise.all([fetchShop(supabase), fetchCartQuantities(supabase, profile.id)]);
  if (error) {
    return (
      <div className={pageShell}>
        <p role="alert" className="auth-alert rounded-2xl px-5 py-4 text-[0.9375rem]">
          We couldn’t load this product just now. Check your connection, then refresh the page.
        </p>
      </div>
    );
  }
  const product = products.find((p) => p.id === id);
  if (!product) notFound();

  return <ProductView product={product} products={products} inCart={inCart} />;
}
