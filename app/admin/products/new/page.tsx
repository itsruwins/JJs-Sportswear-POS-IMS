import type { Metadata } from "next";
import { ProductForm } from "@/components/admin/products/product-form";
import { fetchCatalog, formContext } from "@/lib/admin/catalog";
import { requireStaff } from "@/lib/admin/session";

export const metadata: Metadata = { title: "New product · J&J Sportswear Admin" };

export default async function NewProductPage() {
  const { supabase } = await requireStaff();
  const { products } = await fetchCatalog(supabase);
  const { suggestions, takenSkus } = formContext(products);
  return <ProductForm product={null} images={[]} suggestions={suggestions} takenSkus={takenSkus} />;
}
