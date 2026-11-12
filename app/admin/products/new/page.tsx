import type { Metadata } from "next";
import { ProductForm } from "@/features/admin/products/components/product-form";
import { fetchCatalog, formContext } from "@/features/shared/catalog/catalog";
import { requireOwner } from "@/features/admin/shell/session";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  const { supabase } = await requireOwner();
  const { products } = await fetchCatalog(supabase);
  const { suggestions, takenSkus } = formContext(products);
  return <ProductForm product={null} images={[]} suggestions={suggestions} takenSkus={takenSkus} />;
}
