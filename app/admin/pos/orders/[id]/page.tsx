import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Plus } from "lucide-react";
import { OrderSlip } from "@/features/admin/design-orders/components/order-slip";
import { COUNTER_ORDERS_MIGRATION, fetchCounterOrder } from "@/features/admin/design-orders/data";
import { PrintButtons } from "@/features/admin/sales/components/receipt-actions";
import { requireStaff } from "@/features/admin/shell/session";

export const metadata: Metadata = { title: "Order slip · J&J Sportswear Admin" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A design order's slip, right after it's placed at the counter (or reprinted later). */
export default async function OrderSlipPage({ params, searchParams }: PageProps<"/admin/pos/orders/[id]">) {
  const { supabase } = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const query = await searchParams;
  const fresh = query.new === "1";
  const change = Math.max(0, Number(query.change) || 0);

  const { order, error, outdated } = await fetchCounterOrder(supabase, id);
  if (error) {
    return (
      <div className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10">
        <p role="alert" className="auth-alert mx-auto max-w-[24rem] rounded-2xl px-5 py-4 text-[0.9375rem]">
          {outdated
            ? `Order slips need the shop’s latest database update (${COUNTER_ORDERS_MIGRATION}).`
            : "We couldn’t load this order just now. Refresh the page to try again."}
        </p>
      </div>
    );
  }
  if (!order) notFound();

  return (
    <div className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10">
      <div data-print="hide" className="mx-auto max-w-[24rem]">
        <Link href="/admin/pos?tab=designs" className="press inline-flex items-center gap-1.5 py-1 text-[0.9375rem] font-semibold text-ink hover:underline">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Designs
        </Link>
        {fresh && (
          <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-ground-2 px-4 py-3 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)]">
            <Check aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.5} />
            Order {order.orderNumber} placed{change > 0 ? `. Give ₱${change.toLocaleString("en-PH")} change.` : "."}
          </p>
        )}
        <h1 className="sr-only">Order slip {order.orderNumber}</h1>
      </div>

      <div className="mt-6">
        <OrderSlip order={order} change={fresh ? change : 0} />
      </div>

      <div data-print="hide" className="mx-auto mt-6 flex max-w-[24rem] flex-col gap-2.5">
        {fresh && (
          <Link
            href="/admin/pos?tab=designs"
            className="press inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-board px-5 text-[1rem] font-semibold text-board-ink hover:bg-board-deep"
          >
            <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} />
            New design order
          </Link>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <PrintButtons primary={!fresh} label="Print slip" />
        </div>
        <Link
          href={`/admin/orders/${order.id}`}
          className="press mt-2 inline-flex items-center justify-center gap-1.5 py-1 text-[0.9375rem] font-semibold text-ink hover:underline"
        >
          Open the order
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </div>
  );
}
