import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PrintButton, ReportPeriod } from "@/components/admin/reports/report-controls";
import { CsvLink, MovementTable, ReportSection, RestockTable, StockTable } from "@/components/admin/reports/report-tables";
import { formatPeso } from "@/lib/admin/catalog";
import { historyBounds, parseHistoryFilters, type HistoryFilters } from "@/lib/admin/history";
import { fetchMovements, fetchStockRows, groupByProduct, needsRestock, stockSummary } from "@/lib/admin/inventory";
import { requireStaff } from "@/lib/admin/session";

export const metadata: Metadata = { title: "Inventory report · J&J Sportswear Admin" };

const TZ = "Asia/Manila";
const day = (ymd: string, withYear = false) =>
  new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" }).format(
    new Date(`${ymd}T00:00:00Z`),
  );

function periodLabel(f: HistoryFilters) {
  if (f.range === "today") return `Today, ${day(f.to)}`;
  if (f.range === "7d") return `Last 7 days · ${day(f.from)} – ${day(f.to)}`;
  if (f.range === "30d") return `Last 30 days · ${day(f.from)} – ${day(f.to)}`;
  if (f.range === "all") return `All time, through ${day(f.to, true)}`;
  return f.from === f.to ? day(f.from, true) : `${day(f.from)} – ${day(f.to, true)}`;
}

/** The owner's inventory report: what's on hand, what needs restocking, and how stock moved. Prints and exports. */
export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const { supabase, profile } = await requireStaff();
  if (profile.role !== "owner") redirect("/admin");

  const filters = parseHistoryFilters(await searchParams, "30d");
  const { fromIso, toIso } = historyBounds(filters);
  const [stock, moves] = await Promise.all([fetchStockRows(supabase), fetchMovements(supabase, fromIso, toIso)]);

  const summary = stockSummary(stock.rows);
  const restock = needsRestock(stock.rows);
  const groups = groupByProduct(stock.rows);
  const asOf = new Intl.DateTimeFormat("en-PH", { dateStyle: "full", timeStyle: "short", timeZone: TZ }).format(new Date());
  const periodQs = new URLSearchParams({ range: filters.range, ...(filters.range === "custom" ? { from: filters.from, to: filters.to } : {}) });

  return (
    <div className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <h1 className="voice-display text-[clamp(2.25rem,5vw,3.5rem)]">Inventory report</h1>
          <p className="mt-2 max-w-[60ch] text-[0.9375rem] text-ink-2">
            <span className="print-only">J&amp;J Sportswear, Legazpi City. </span>As of {asOf}. Values use selling prices; archived products and hidden sizes aren’t counted.
          </p>
        </div>
        <div data-print="hide">
          <PrintButton />
        </div>
      </header>

      {stock.error ? (
        <p role="alert" className="auth-alert mt-6 rounded-2xl px-5 py-4 text-[0.9375rem]">
          We couldn’t load the inventory just now. Refresh the page to try again.
        </p>
      ) : (
        <dl className="mt-6 grid grid-cols-3 gap-x-6 gap-y-5 border-y border-line py-5 lg:grid-cols-6">
          <Stat label="Stock value" value={formatPeso(summary.value)} wide />
          <Stat label="Pieces on hand" value={summary.pieces.toLocaleString("en-PH")} />
          <Stat label="Products on sale" value={String(summary.products)} />
          <Stat label="Sizes and colors" value={String(summary.variants)} />
          <Stat label="Low" value={String(summary.low)} />
          <Stat label="Sold out" value={String(summary.out)} />
        </dl>
      )}

      {!stock.error && (
        <ReportSection
          id="restock-title"
          title="Needs restock"
          note={restock.length ? `${restock.length} ${restock.length === 1 ? "size" : "sizes"} at or below the alert level` : undefined}
          csv="/admin/reports/export?kind=restock"
        >
          <RestockTable rows={restock} />
        </ReportSection>
      )}

      <ReportSection id="movement-title" title="Stock movement" note={periodLabel(filters)} csv={`/admin/reports/export?kind=movement&${periodQs}`} csvText="Summary CSV">
        <div data-print="hide" className="flex flex-wrap items-center justify-between gap-3 py-4">
          <ReportPeriod range={filters.range} from={filters.from} to={filters.to} />
          <CsvLink href={`/admin/reports/export?kind=history&${periodQs}`} text="All changes CSV" label="Every stock change in this period" />
        </div>
        {moves.error ? (
          <p role="alert" className="auth-alert rounded-2xl px-5 py-4 text-[0.9375rem]">
            We couldn’t load stock movement just now. Refresh the page to try again.
          </p>
        ) : (
          <>
            <MovementTable movements={moves.movements} total={moves.total} />
            {moves.truncated && (
              <p className="mt-3 text-[0.875rem] text-ink-2">This period is very large; totals cover the first 50,000 changes. Pick a shorter period.</p>
            )}
          </>
        )}
      </ReportSection>

      {!stock.error && (
        <ReportSection id="stock-title" title="Stock on hand" note="Every size and color on sale, by product" csv="/admin/reports/export?kind=stock">
          <StockTable groups={groups} pieces={summary.pieces} value={summary.value} />
        </ReportSection>
      )}
    </div>
  );
}

function Stat({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-3 sm:col-span-1" : undefined}>
      <dt className="text-[0.8125rem] text-ink-2">{label}</dt>
      <dd className="voice-board tabular mt-1 text-[1.75rem] leading-none text-ink">{value}</dd>
    </div>
  );
}
