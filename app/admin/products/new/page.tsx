import type { Metadata } from "next";
import { ProductForm } from "@/components/admin/products/product-form";
import { fetchCatalog, formContext } from "@/features/shared/catalog/catalog";
import { requireOwner } from "@/lib/admin/session";

export const metadata: Metadata = { title: "New product · J&J Sportswear Admin" };

export default async function NewProductPage() {
  const { supabase } = await requireOwner();
  const { products } = await fetchCatalog(supabase);
  const { suggestions, takenSkus } = formContext(products);
  return <ProductForm product={null} images={[]} suggestions={suggestions} takenSkus={takenSkus} />;
}
