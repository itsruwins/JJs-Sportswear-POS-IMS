import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LiveRefresh } from "@/components/admin/live-refresh";
import { RecentMoves } from "@/components/admin/stock/recent-moves";
import { StockBrowser } from "@/components/admin/stock/stock-browser";
import { fetchCatalog, fetchRecentMoves } from "@/lib/admin/catalog";
import { requireStaff } from "@/lib/admin/session";

export const metadata: Metadata = { title: "Stock · J&J Sportswear Admin" };

export default async function StockPage() {
  const { supabase } = await requireStaff();
  const [{ products, error }, { moves }] = await Promise.all([fetchCatalog(supabase), fetchRecentMoves(supabase, 8)]);

  return (
    <div className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10">
      <LiveRefresh />
      <header className="mb-7">
        <h1 className="voice-display text-[clamp(2.25rem,5vw,3.5rem)]">Stock</h1>
        <p className="mt-2 max-w-[60ch] text-[0.9375rem] text-ink-2">
          Restock a delivery, take back returns, remove damaged pieces, or correct a count. Every change is logged with who
          made it and why.
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
        <section aria-label="Products">
          {error ? (
            <p role="alert" className="auth-alert rounded-2xl px-5 py-4 text-[0.9375rem]">
              We couldn’t load the products just now. Refresh the page to try again.
            </p>
          ) : (
            <StockBrowser products={products} />
          )}
        </section>
        <section aria-labelledby="recent-title" className="lg:sticky lg:top-24 lg:self-start">
          <h2 id="recent-title" className="voice-display border-b border-line pb-3 text-[1.5rem]">
            Recent changes
          </h2>
          <RecentMoves moves={moves} />
          {moves.length > 0 && (
            <Link
              href="/admin/history"
              className="press mt-3 inline-flex items-center gap-1.5 rounded-full py-1.5 text-[0.9375rem] font-semibold text-ink hover:underline"
            >
              See all history
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}
