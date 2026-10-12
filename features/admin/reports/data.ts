import type { SupabaseClient } from "@supabase/supabase-js";
import { historyBounds, manilaToday, shiftDate, type HistoryFilters } from "./history";

export type Bucket = "hour" | "day" | "month";

export type ReportTotals = { sales: number; revenue: number; pieces: number; cash: number; gcash: number; voided: number; voided_revenue: number };
export type SeriesPoint = { bucket: string; label: string; sales: number; revenue: number };
export type ProductLine = { product_id: string; name: string; pieces: number; revenue: number };
export type VariantLine = ProductLine & { size: string | null; color: string | null };
export type CashierLine = { id: string; username: string; full_name: string | null; sales: number; revenue: number };

export type SalesReport = {
  bucket: Bucket;
  totals: ReportTotals;
  series: SeriesPoint[];
  products: ProductLine[];
  variants: VariantLine[];
  cashiers: CashierLine[];
  /** The same figures for the period just before, when there is one (not for "All time"). */
  previous: ReportTotals | null;
  previousLabel: string | null;
};

const MIGRATION = "supabase/migrations/20261008000000_sales_report.sql";
const EMPTY: ReportTotals = { sales: 0, revenue: 0, pieces: 0, cash: 0, gcash: 0, voided: 0, voided_revenue: 0 };

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

/** Hours for a single day, days up to about three months, months beyond. */
export function bucketFor(from: string, to: string): Bucket {
  if (from && from === to) return "hour";
  if (!from || daysBetween(from, to) > 92) return "month";
  return "day";
}

const utcDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const dayLabel = (ymd: string) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" }).format(utcDate(ymd));
const monthLabel = (ym: string) => new Intl.DateTimeFormat("en-PH", { month: "short", year: "numeric", timeZone: "UTC" }).format(utcDate(`${ym}-01`));
const hourLabel = (h: number) => (h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`);

/** Every bucket in the period, with zeros where nothing sold, so the chart's gaps are real. */
function fillSeries(bucket: Bucket, raw: { bucket: string; sales: number; revenue: number }[], from: string, to: string): SeriesPoint[] {
  const got = new Map(raw.map((r) => [r.bucket, r]));
  const point = (key: string, label: string) => ({ bucket: key, label, sales: Number(got.get(key)?.sales ?? 0), revenue: Number(got.get(key)?.revenue ?? 0) });
  if (bucket === "hour") {
    // Opening hours by default (8 AM–8 PM), widened when a sale fell outside them.
    const hours = raw.map((r) => Number(r.bucket));
    const first = Math.min(8, ...hours);
    const last = Math.max(20, ...hours);
    return Array.from({ length: last - first + 1 }, (_, i) => {
      const h = first + i;
      return point(String(h).padStart(2, "0"), hourLabel(h));
    });
  }
  if (bucket === "day") {
    return Array.from({ length: daysBetween(from, to) }, (_, i) => {
      const d = shiftDate(from, i);
      return point(d, dayLabel(d));
    });
  }
  // Months: from the later of the period's first month and the first sale's, through the last month.
  // Counted back from the end (at most 20 years), so the latest months are never the ones cut.
  const end = to.slice(0, 7);
  const firstSale = raw[0]?.bucket;
  let start = from ? from.slice(0, 7) : (firstSale ?? end);
  if (firstSale && firstSale > start) start = firstSale;
  const [endYear, endMonth] = end.split("-").map(Number);
  const floor = `${endYear - 20}-${String(endMonth).padStart(2, "0")}`;
  if (start < floor) start = floor;
  const out: SeriesPoint[] = [];
  for (let ym = start; ym <= end; ) {
    out.push(point(ym, monthLabel(ym)));
    const [y, m] = ym.split("-").map(Number);
    ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  return out;
}

const toTotals = (t: Partial<Record<keyof ReportTotals, number | string>> | null | undefined): ReportTotals =>
  Object.fromEntries(Object.keys(EMPTY).map((k) => [k, Number(t?.[k as keyof ReportTotals] ?? 0)])) as ReportTotals;

/** The period just before this one, the same length (none for "All time"). */
export function previousPeriod(f: Pick<HistoryFilters, "range" | "from" | "to">) {
  if (f.range === "all" || !f.from) return null;
  const days = daysBetween(f.from, f.to);
  const to = shiftDate(f.from, -1);
  const from = shiftDate(to, -(days - 1));
  const label =
    f.range === "today"
      ? f.to === manilaToday()
        ? "yesterday"
        : "the day before"
      : f.range === "7d"
        ? "the 7 days before"
        : f.range === "30d"
          ? "the 30 days before"
          : days === 1
            ? "the day before"
            : `the ${days} days before`;
  return { from, to, label };
}

/** The owner's sales report for the filters' period, summed in the database. */
export async function fetchSalesReport(
  supabase: SupabaseClient,
  f: Pick<HistoryFilters, "range" | "from" | "to">,
): Promise<{ report: SalesReport | null; error: string | null }> {
  const bucket = bucketFor(f.from, f.to);
  const { fromIso, toIso } = historyBounds(f);
  const prev = previousPeriod(f);
  const call = (from: string, to: string, b: Bucket) =>
    supabase.rpc("sales_report", { p_from: from || null, p_to: to, p_bucket: b });

  const [cur, before] = await Promise.all([
    call(fromIso, toIso, bucket),
    prev ? call(historyBounds(prev).fromIso, historyBounds(prev).toIso, "month") : null,
  ]);
  if (cur.error) {
    if (cur.error.code === "PGRST202") return { report: null, error: `The sales report needs the latest database update (${MIGRATION}).` };
    if (cur.error.code === "42501") return { report: null, error: "Only the owner can see the sales report." };
    return { report: null, error: "We couldn’t load the sales report just now. Refresh the page to try again." };
  }

  type Raw = {
    totals: Record<string, number | string>;
    series: { bucket: string; sales: number; revenue: number | string }[];
    products: (Omit<ProductLine, "pieces" | "revenue"> & { pieces: number | string; revenue: number | string })[];
    variants: (Omit<VariantLine, "pieces" | "revenue"> & { pieces: number | string; revenue: number | string })[];
    cashiers: (Omit<CashierLine, "sales" | "revenue"> & { sales: number | string; revenue: number | string })[];
  };
  const r = cur.data as Raw;
  const num = <T extends { pieces?: number | string; revenue: number | string; sales?: number | string }>(x: T) => ({
    ...x,
    ...(x.pieces !== undefined ? { pieces: Number(x.pieces) } : {}),
    ...(x.sales !== undefined ? { sales: Number(x.sales) } : {}),
    revenue: Number(x.revenue),
  });
  const rawSeries = (r.series ?? []).map((s) => ({ bucket: s.bucket, sales: Number(s.sales), revenue: Number(s.revenue) }));

  return {
    report: {
      bucket,
      totals: toTotals(r.totals),
      series: fillSeries(bucket, rawSeries, f.from, f.to),
      products: (r.products ?? []).map(num) as ProductLine[],
      variants: (r.variants ?? []).map(num) as VariantLine[],
      cashiers: (r.cashiers ?? []).map(num) as CashierLine[],
      // A failed comparison just leaves the comparison out.
      previous: before && !before.error ? toTotals((before.data as Raw | null)?.totals) : null,
      previousLabel: prev?.label ?? null,
    },
    error: null,
  };
}

/** "+12%", "−8%", "new" (nothing before), or null when both are zero. */
export function change(now: number, before: number) {
  if (before === 0) return now === 0 ? null : "new";
  const pct = Math.round(((now - before) / before) * 100);
  return pct === 0 ? "same" : pct > 0 ? `+${pct}%` : `−${-pct}%`;
}
