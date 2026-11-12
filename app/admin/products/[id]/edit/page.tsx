import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductForm } from "@/features/admin/products/components/product-form";
import { fetchCatalog, fetchProductImages, formContext } from "@/features/shared/catalog/catalog";
import { requireOwner } from "@/features/admin/shell/session";

export const metadata: Metadata = { title: "Edit product" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditProductPage({ params }: PageProps<"/admin/products/[id]/edit">) {
  const { supabase } = await requireOwner();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const [{ products, error }, images] = await Promise.all([fetchCatalog(supabase), fetchProductImages(supabase, id)]);
  if (error) throw error;
  const product = products.find((p) => p.id === id);
  if (!product) notFound();

  const { suggestions, takenSkus } = formContext(products, id);
  return <ProductForm key={product.updated_at} product={product} images={images} suggestions={suggestions} takenSkus={takenSkus} />;
}
