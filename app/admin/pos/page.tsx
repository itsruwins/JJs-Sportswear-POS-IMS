import type { Metadata } from "next";
import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { LiveRefresh } from "@/features/shared/ui/live-refresh";
import { PosScreen, type PosProduct } from "@/features/admin/pos/components/pos-screen";
import { DesignOrderScreen } from "@/features/admin/design-orders/components/design-order-screen";
import { designsFrom } from "@/features/admin/design-orders/data";
import { fetchCatalog, sortColors, sortSizes } from "@/features/shared/catalog/catalog";
import { fetchProviders } from "@/features/shared/payments/data";
import { geminiConfigured } from "@/features/admin/pos/gemini";
import { requireStaff } from "@/features/admin/shell/session";
import { normalizeTicketCode } from "@/features/shared/tickets/model";

export const metadata: Metadata = { title: "Point of sale · J&J Sportswear Admin" };

/**
 * The counter. Shelf: find an item, pick its size and color, take cash or an e-payment, and print the
 * receipt. Designs: take an order for the shop's made-to-order designs with at least half down.
 */
export default async function PosPage({ searchParams }: PageProps<"/admin/pos">) {
  const { supabase, profile } = await requireStaff();
  const params = await searchParams;
  const tab = params.tab === "designs" ? "designs" : "shelf";
  // A ticket code handed from one tab to the other (a design code scanned on Shelf, or a ready-made one on Designs).
  const ticket = typeof params.ticket === "string" ? normalizeTicketCode(params.ticket) : null;
  const [{ products, error }, { providers }] = await Promise.all([fetchCatalog(supabase), fetchProviders(supabase)]);

  // Only what can be sold off the shelf: products in the catalog and their visible sizes and colors.
  // Made-to-order designs are taken as orders on the Designs tab instead.
  const forSale: PosProduct[] = products
    .filter((p) => p.is_active && !p.made_to_order)
    .map((p) => {
      const variants = p.variants.filter((v) => v.is_active);
      const sizes = sortSizes([...new Set(variants.map((v) => v.size ?? ""))]);
      const colors = sortColors([...new Set(variants.map((v) => v.color ?? ""))]);
      return {
        id: p.id,
        name: p.name,
        image: p.image,
        tags: p.tags,
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

  const tabClass = (on: boolean) =>
    `press inline-flex h-10 items-center rounded-lg px-4 text-[0.9375rem] font-semibold ${on ? "bg-ink text-ground" : "text-ink-2 hover:text-ink"}`;
  const header = (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="voice-display text-[clamp(2.25rem,5vw,3.5rem)]">Point of sale</h1>
        <p className="mt-2 max-w-[60ch] text-[0.9375rem] text-ink-2">
          {tab === "designs"
            ? "Take an order for a design, or load the customer’s design ticket: styles and sizes, the buyer, and at least half down."
            : "Find the item, tap its size, and take payment. Stock updates the moment it sells."}
        </p>
        <nav aria-label="What to sell" className="mt-4 inline-flex gap-1 rounded-xl bg-ground-2 p-1 shadow-[inset_0_0_0_1px_var(--line)]">
          <Link href="/admin/pos" aria-current={tab === "shelf" ? "page" : undefined} className={tabClass(tab === "shelf")}>
            Shelf
          </Link>
          <Link href="/admin/pos?tab=designs" aria-current={tab === "designs" ? "page" : undefined} className={tabClass(tab === "designs")}>
            Designs
          </Link>
        </nav>
      </div>
      <Link
        href={tab === "designs" ? "/admin/orders" : "/admin/sales"}
        className="press inline-flex h-11 items-center gap-2 rounded-xl px-4 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2"
      >
        <ReceiptText aria-hidden="true" className="size-4" />
        {tab === "designs" ? "Custom orders" : "Sales and receipts"}
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
        tab === "designs" ? (
          <>
            {header}
            <DesignOrderScreen
              designs={designsFrom(products)}
              providers={providers.filter((p) => p.isActive)}
              reader={geminiConfigured()}
              isOwner={profile.role === "owner"}
              initialTicket={ticket}
            />
          </>
        ) : (
          <PosScreen products={forSale} providers={providers.filter((p) => p.isActive)} reader={geminiConfigured()} isOwner={profile.role === "owner"} header={header} initialTicket={ticket} />
        )
      )}
    </div>
  );
}
