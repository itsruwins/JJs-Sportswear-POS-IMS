import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { LiveRefresh } from "@/features/shared/ui/live-refresh";
import { ReportPeriod } from "@/components/admin/reports/report-controls";
import { SalesFigures, SalesList } from "@/components/admin/sales/sales-list";
import { historyBounds, manilaToday, parseHistoryFilters, shiftDate } from "@/lib/admin/history";
import { fetchSales, fetchSalesTotals } from "@/lib/admin/sales";
import { requireStaff } from "@/lib/admin/session";

export const metadata: Metadata = { title: "Sales · J&J Sportswear Admin" };

/** Receipts to find and reprint. Staff see today's sales; the owner can look back over any period, with totals. */
export default async function SalesPage({ searchParams }: PageProps<"/admin/sales">) {
  const { supabase, profile } = await requireStaff();
  const isOwner = profile.role === "owner";
  const today = manilaToday();
  const filters = parseHistoryFilters(isOwner ? await searchParams : {}, "today");
  const { fromIso, toIso } = historyBounds(isOwner ? filters : { from: today, to: today });
  // The list stops at 300 rows; the owner's totals cover the whole period.
  const [{ sales, more, error: listError }, sums] = await Promise.all([
    fetchSales(supabase, fromIso, toIso),
    isOwner ? fetchSalesTotals(supabase, fromIso, toIso) : null,
  ]);
  const error = listError ?? sums?.error;
  const standing = sales.filter((s) => !s.voided_at);

  return (
    <div className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10">
      <LiveRefresh />
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="voice-display text-[clamp(2.25rem,5vw,3.5rem)]">Sales</h1>
          <p className="mt-2 max-w-[60ch] text-[0.9375rem] text-ink-2">
            {isOwner ? "Every counter sale. Open one to reprint its receipt or void it." : "Today’s counter sales. Open one to reprint its receipt."}
          </p>
        </div>
        <Link
          href="/admin/pos"
          className="press inline-flex h-11 items-center gap-2 rounded-xl bg-board px-5 text-[0.9375rem] font-semibold text-board-ink hover:bg-board-deep"
        >
          <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} />
          New sale
        </Link>
      </header>

      {isOwner && (
        <div className="mb-5">
          <ReportPeriod range={filters.range} from={filters.from} to={filters.to} defaultRange="today" />
        </div>
      )}

      {error ? (
        <p role="alert" className="auth-alert rounded-2xl px-5 py-4 text-[0.9375rem]">
          We couldn’t load the sales just now. Refresh the page to try again.
        </p>
      ) : (
        <>
          {sums ? (
            <SalesFigures totals={sums.totals} />
          ) : (
            <p className="mb-4 text-[0.9375rem] text-ink-2">
              {standing.length} {standing.length === 1 ? "sale" : "sales"} today
            </p>
          )}
          <SalesList sales={sales} today={today} yesterday={shiftDate(today, -1)} />
          {more && <p className="mt-4 text-[0.875rem] text-ink-2">Showing the latest 300 sales. Pick a shorter period to see the rest.</p>}
        </>
      )}
    </div>
  );
}
