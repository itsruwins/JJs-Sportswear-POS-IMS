import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";
import { HistoryFilters } from "@/components/admin/history/history-filters";
import { CsvLink } from "@/components/admin/reports/report-tables";
import { HistoryList } from "@/components/admin/history/history-list";
import { LiveRefresh } from "@/components/admin/live-refresh";
import { fetchHistory, fetchHistoryOptions, HISTORY_STEP, MAX_SHOW, manilaToday, parseHistoryFilters, shiftDate } from "@/lib/admin/history";
import { requireStaff } from "@/lib/admin/session";

export const metadata: Metadata = { title: "History · J&J Sportswear Admin" };

export default async function HistoryPage({ searchParams }: PageProps<"/admin/history">) {
  const { supabase, profile } = await requireStaff();
  const params = await searchParams;
  const filters = parseHistoryFilters(params);
  const [history, options] = await Promise.all([fetchHistory(supabase, filters), fetchHistoryOptions(supabase)]);

  const today = manilaToday();
  const yesterday = shiftDate(today, -1);
  const moreParams = new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : Array.isArray(v) ? [[k, v[0]]] : [])),
  );
  moreParams.set("show", String(filters.show + HISTORY_STEP));
  const filtered = filters.type !== "all" || !!filters.product || !!filters.staff || filters.range !== "7d";
  // The export takes the same filters, with the range spelled out (the export's own default differs).
  const csvParams = new URLSearchParams({ kind: "history", range: filters.range });
  if (filters.range === "custom") {
    csvParams.set("from", filters.from);
    csvParams.set("to", filters.to);
  }
  if (filters.type !== "all") csvParams.set("type", filters.type);
  if (filters.product) csvParams.set("product", filters.product);
  if (filters.staff) csvParams.set("staff", filters.staff);

  return (
    <div className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10">
      <LiveRefresh />
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div>
          <h1 className="voice-display text-[clamp(2.25rem,5vw,3.5rem)]">History</h1>
          <p className="mt-2 max-w-[60ch] text-[0.9375rem] text-ink-2">
            Every stock change: who made it, when, by how much, and why.
          </p>
        </div>
        {profile.role === "owner" && history.total > 0 && <CsvLink href={`/admin/reports/export?${csvParams}`} label="Stock history with these filters" />}
      </header>

      <HistoryFilters filters={filters} products={options.products} staff={options.staff} />

      {history.error ? (
        <p role="alert" className="auth-alert mt-6 rounded-2xl px-5 py-4 text-[0.9375rem]">
          We couldn’t load the history just now. Refresh the page to try again.
        </p>
      ) : (
        <>
          <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3 border-y border-line py-4">
            <div>
              <dt className="text-[0.8125rem] text-ink-2">Changes</dt>
              <dd className="voice-board tabular mt-0.5 text-[1.75rem] leading-none text-ink">{history.total}</dd>
            </div>
            <div>
              <dt className="text-[0.8125rem] text-ink-2">Pieces in</dt>
              <dd className="voice-board tabular mt-0.5 text-[1.75rem] leading-none text-ink">{history.added ? `+${history.added}` : 0}</dd>
            </div>
            <div>
              <dt className="text-[0.8125rem] text-ink-2">Pieces out</dt>
              <dd className="voice-board tabular mt-0.5 text-[1.75rem] leading-none text-ink">{history.removed ? `−${history.removed}` : 0}</dd>
            </div>
          </dl>

          {history.moves.length === 0 ? (
            <div className="flex items-start gap-4 py-10">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ground-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]">
                <History aria-hidden="true" className="size-6" strokeWidth={1.7} />
              </span>
              <div>
                <p className="text-[1.0625rem] font-semibold text-ink">
                  {filtered ? "No stock changes here" : "No stock changes in the last 7 days"}
                </p>
                <p className="mt-1 max-w-[52ch] text-[0.9375rem] leading-relaxed text-ink-2">
                  {filtered
                    ? "Nothing matches these filters. Try a longer date range, or reset the filters."
                    : "Restocks, returns, damage, and recounts show up here as they happen."}
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-6">
              <HistoryList moves={history.moves} today={today} yesterday={yesterday} />
              {history.hasMore && filters.show >= MAX_SHOW && (
                <p className="mt-6 text-center text-[0.9375rem] text-ink-2">
                  Showing the latest {MAX_SHOW}. Narrow the dates or filters to see older changes.
                </p>
              )}
              {history.hasMore && filters.show < MAX_SHOW && (
                <div className="mt-6 flex justify-center">
                  <Link
                    href={`/admin/history?${moreParams.toString()}`}
                    scroll={false}
                    className="press inline-flex h-11 items-center rounded-xl px-5 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2"
                  >
                    Show {Math.min(HISTORY_STEP, history.total - history.moves.length)} more
                  </Link>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
