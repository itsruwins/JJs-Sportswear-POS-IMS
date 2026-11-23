import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { LiveRefresh } from "@/features/shared/ui/live-refresh";
import { ReportPeriod } from "@/features/admin/reports/components/report-controls";
import { SalesCount, SalesFigures, SalesFilter, SalesList } from "@/features/admin/sales/components/sales-list";
import { historyBounds, manilaToday, parseHistoryFilters, shiftDate } from "@/features/admin/history/data";
import { fetchOrderMoney, fetchOrderMoneyTotals, fetchSales, fetchSalesTotals } from "@/features/admin/sales/data";
import { mergeTimeline, parseSalesKind, SALES_KINDS, type SalesKind } from "@/features/admin/sales/timeline";
import { requireStaff } from "@/features/admin/shell/session";

export const metadata: Metadata = { title: "Sales" };

/**
 * Counter sales and custom-order money in one list: shelf sales with their receipts, and verified
 * order payments (Designs-tab down payments, balances, online payments) less refunds. Staff see
 * today's; the owner can look back over any period, with totals. All · Shelf · Orders filters both.
 */
export default async function SalesPage({ searchParams }: PageProps<"/admin/sales">) {
  const { supabase, profile } = await requireStaff();
  const isOwner = profile.role === "owner";
  const today = manilaToday();
  const params = await searchParams;
  const kind = parseSalesKind(params.kind);
  const filters = parseHistoryFilters(isOwner ? params : {}, "today");
  const { fromIso, toIso } = historyBounds(isOwner ? filters : { from: today, to: today });
  const shelf = kind !== "orders";
  const orders = kind !== "shelf";
  // Each list stops at 300 rows; the owner's totals cover the whole period.
  const [saleList, orderList, shelfSums, orderSums] = await Promise.all([
    shelf ? fetchSales(supabase, fromIso, toIso) : null,
    orders ? fetchOrderMoney(supabase, fromIso, toIso) : null,
    isOwner && shelf ? fetchSalesTotals(supabase, fromIso, toIso) : null,
    isOwner && orders ? fetchOrderMoneyTotals(supabase, fromIso, toIso) : null,
  ]);
  const error = saleList?.error ?? orderList?.error ?? shelfSums?.error ?? orderSums?.error;
  const { entries, more } = mergeTimeline(saleList?.sales ?? [], saleList?.more ?? false, orderList?.lines ?? [], orderList?.more ?? false);
  const standing = (saleList?.sales ?? []).filter((s) => !s.voided_at).length;
  const payments = (orderList?.lines ?? []).filter((l) => l.kind === "payment").length;

  // The filter keeps the period; "All" stays out of the URL.
  const hrefFor = Object.fromEntries(
    SALES_KINDS.map(({ id }) => {
      const q = new URLSearchParams();
      for (const k of ["range", "from", "to"]) {
        const v = params[k];
        if (isOwner && typeof v === "string" && v) q.set(k, v);
      }
      if (id !== "all") q.set("kind", id);
      const qs = q.toString();
      return [id, qs ? `/admin/sales?${qs}` : "/admin/sales"];
    }),
  ) as Record<SalesKind, string>;

  return (
    <div className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10">
      <LiveRefresh tables={["products", "product_variants", "inventory_transactions", "payments", "custom_order_refunds"]} />
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="voice-display text-[clamp(2.25rem,5vw,3.5rem)]">Sales</h1>
          <p className="mt-2 max-w-[60ch] text-[0.9375rem] text-ink-2">
            {isOwner
              ? "Every counter sale and custom-order payment. Open a sale to reprint its receipt or void it."
              : "Today’s counter sales and custom-order payments. Open a sale to reprint its receipt."}
          </p>
        </div>
        <Link
          href="/admin/pos"
          className="press inline-flex h-11 items-center gap-2 rounded-xl bg-action px-5 text-[0.9375rem] font-semibold text-action-ink hover:bg-action-deep"
        >
          <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} />
          New sale
        </Link>
      </header>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        {isOwner && <ReportPeriod range={filters.range} from={filters.from} to={filters.to} defaultRange="today" />}
        <SalesFilter kind={kind} hrefFor={hrefFor} />
      </div>

      {error ? (
        <p role="alert" className="auth-alert rounded-2xl px-5 py-4 text-[0.9375rem]">
          We couldn’t load the sales just now. Refresh the page to try again.
        </p>
      ) : (
        <>
          {isOwner ? (
            <SalesFigures kind={kind} shelf={shelfSums?.totals ?? null} orders={orderSums?.totals ?? null} />
          ) : (
            <SalesCount kind={kind} sales={standing} payments={payments} />
          )}
          <SalesList entries={entries} kind={kind} today={today} yesterday={shiftDate(today, -1)} />
          {more && <p className="mt-4 text-[0.875rem] text-ink-2">Showing the latest entries only. Pick a shorter period to see the rest.</p>}
        </>
      )}
    </div>
  );
}
