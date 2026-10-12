import type { Metadata } from "next";
import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { LiveRefresh } from "@/features/shared/ui/live-refresh";
import { PosScreen, type PosProduct } from "@/features/admin/pos/components/pos-screen";
import { fetchCatalog, sortColors, sortSizes } from "@/features/shared/catalog/catalog";
import { fetchProviders } from "@/features/shared/payments/data";
import { requireStaff } from "@/features/admin/shell/session";

export const metadata: Metadata = { title: "Point of sale · J&J Sportswear Admin" };

/** The counter: find an item, pick its size and color, take cash or an e-payment, and print the receipt. */
export default async function PosPage() {
  const { supabase } = await requireStaff();
  const [{ products, error }, { providers }] = await Promise.all([fetchCatalog(supabase), fetchProviders(supabase)]);

  // Only what can be sold: products in the catalog and their visible sizes and colors.
  const forSale: PosProduct[] = products
    .filter((p) => p.is_active)
    .map((p) => {
      const variants = p.variants.filter((v) => v.is_active);
      const sizes = sortSizes([...new Set(variants.map((v) => v.size ?? ""))]);
      const colors = sortColors([...new Set(variants.map((v) => v.color ?? ""))]);
      return {
        id: p.id,
        name: p.name,
        image: p.image,
        tags: p.tags.filter((t) => t.toLowerCase() !== "sample"),
        variants: variants
          .map((v) => ({
            id: v.id,
            size: v.size,
            color: v.color,
            sku: v.sku,
            price: v.price,
            stock: v.stock_quantity,
            threshold: v.low_stock_threshold,
          }))
          .sort(
            (a, b) =>
              colors.indexOf(a.color ?? "") - colors.indexOf(b.color ?? "") || sizes.indexOf(a.size ?? "") - sizes.indexOf(b.size ?? ""),
          ),
      };
    })
    .filter((p) => p.variants.length > 0);

  const header = (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="voice-display text-[clamp(2.25rem,5vw,3.5rem)]">Point of sale</h1>
        <p className="mt-2 max-w-[60ch] text-[0.9375rem] text-ink-2">Find the item, tap its size, and take payment. Stock updates the moment it sells.</p>
      </div>
      <Link
        href="/admin/sales"
        className="press inline-flex h-11 items-center gap-2 rounded-xl px-4 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2"
      >
        <ReceiptText aria-hidden="true" className="size-4" />
        Sales and receipts
      </Link>
    </header>
  );

  return (
    <div className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10">
      <LiveRefresh />
      {error ? (
        <>
          {header}
          <p role="alert" className="auth-alert rounded-2xl px-5 py-4 text-[0.9375rem]">
            We couldn’t load the products just now. Refresh the page to try again.
          </p>
        </>
      ) : (
        <PosScreen products={forSale} providers={providers.filter((p) => p.isActive)} header={header} />
      )}
    </div>
  );
}
