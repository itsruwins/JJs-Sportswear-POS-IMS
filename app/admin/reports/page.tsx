import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PrintButton, ReportPeriod } from "@/features/admin/reports/components/report-controls";
import { CsvLink, MovementTable, ReportSection, RestockTable, StockTable } from "@/features/admin/reports/components/report-tables";
import { SalesReportView } from "@/features/admin/reports/components/sales-report";
import { formatPeso } from "@/features/shared/catalog/catalog";
import { historyBounds, parseHistoryFilters, type HistoryFilters } from "@/features/admin/history/data";
import { fetchMovements, fetchStockRows, groupByProduct, needsRestock, stockSummary } from "@/features/admin/stock/data";
import { fetchSalesReport } from "@/features/admin/reports/data";
import { requireStaff, STAFF_HOME } from "@/features/admin/shell/session";
import { Wordmark } from "@/features/shared/ui/wordmark";
import { SHOP } from "@/lib/shop";

export const metadata: Metadata = { title: "Reports" };

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

type Tab = "sales" | "inventory";
const TABS: { id: Tab; label: string }[] = [
  { id: "sales", label: "Sales" },
  { id: "inventory", label: "Inventory" },
];

/** The owner's reports: sales (counter sales over a period) and inventory (stock on hand and how it moved). Both print and export. */
export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  // requireStaff is cached per request, so each tab reuses this same session and check.
  const { profile } = await requireStaff();
  if (profile.role !== "owner") redirect(STAFF_HOME);

  const params = await searchParams;
  const tab: Tab = params.tab === "inventory" ? "inventory" : "sales";
  const filters = parseHistoryFilters(params, "30d");
  const periodQs = new URLSearchParams({ range: filters.range, ...(filters.range === "custom" ? { from: filters.from, to: filters.to } : {}) });
  const asOf = new Intl.DateTimeFormat("en-PH", { dateStyle: "full", timeStyle: "short", timeZone: TZ }).format(new Date());
  // Switching tabs keeps the period.
  const tabHref = (t: Tab) => {
    const q = new URLSearchParams(periodQs);
    if (filters.range === "30d") q.delete("range");
    if (t === "inventory") q.set("tab", "inventory");
    const s = q.toString();
    return s ? `/admin/reports?${s}` : "/admin/reports";
  };

  return (
    <div data-report={tab} className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          {/* Printed reports open with the shop's lockup; on screen the top bar already carries it. */}
          <div className="print-only mb-5">
            <Wordmark />
          </div>
          <h1 className="voice-display text-[clamp(2.25rem,5vw,3.5rem)]">{tab === "sales" ? "Sales report" : "Inventory report"}</h1>
          <p className="mt-2 max-w-[60ch] text-[0.9375rem] text-ink-2">
            <span className="print-only">{SHOP.name}, Legazpi City. </span>As of {asOf}.{" "}
            {tab === "sales"
              ? "Counter sales; voided sales aren’t counted."
              : "Values use selling prices; archived products and hidden sizes aren’t counted."}
          </p>
        </div>
        <div data-print="hide">
          <PrintButton />
        </div>
      </header>

      <nav aria-label="Reports" data-print="hide" className="mt-6 inline-grid grid-cols-2 gap-1 rounded-xl bg-ground-2 p-1 shadow-[inset_0_0_0_1px_var(--line)]">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={tabHref(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`press inline-flex h-10 items-center justify-center rounded-lg px-5 text-[0.9375rem] font-semibold ${
              tab === t.id ? "bg-ink text-ground" : "text-ink-2 hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "sales" ? <SalesTab filters={filters} periodQs={periodQs} /> : <InventoryTab filters={filters} periodQs={periodQs} />}
    </div>
  );
}

async function SalesTab({ filters, periodQs }: { filters: HistoryFilters; periodQs: URLSearchParams }) {
  const { supabase } = await requireStaff();
  const { report, error } = await fetchSalesReport(supabase, filters);
  return (
    <>
      <div data-print="hide" className="mt-6">
        <ReportPeriod range={filters.range} from={filters.from} to={filters.to} />
      </div>
      {/* On paper the period otherwise rides on the Summary; with no Summary, it prints here. */}
      {(error || !report || (report.totals.sales === 0 && report.totals.voided === 0)) && (
        <p className="print-only mt-4 text-[0.9375rem]">{periodLabel(filters)}</p>
      )}
      {error || !report ? (
        <p role="alert" className="auth-alert mt-6 rounded-2xl px-5 py-4 text-[0.9375rem]">
          {error}
        </p>
      ) : (
        <SalesReportView report={report} periodLabel={periodLabel(filters)} csv={`/admin/reports/export?${periodQs}`} />
      )}
    </>
  );
}

async function InventoryTab({ filters, periodQs }: { filters: HistoryFilters; periodQs: URLSearchParams }) {
  const { supabase } = await requireStaff();
  const { fromIso, toIso } = historyBounds(filters);
  const [stock, moves] = await Promise.all([fetchStockRows(supabase), fetchMovements(supabase, fromIso, toIso)]);

  const summary = stockSummary(stock.rows);
  const restock = needsRestock(stock.rows);
  const groups = groupByProduct(stock.rows);

  return (
    <>
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
    </>
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
