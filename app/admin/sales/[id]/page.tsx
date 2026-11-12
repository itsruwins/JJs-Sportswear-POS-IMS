import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Check, Plus } from "lucide-react";
import { Receipt } from "@/features/admin/sales/components/receipt";
import { PrintButtons, VoidSaleButton } from "@/features/admin/sales/components/receipt-actions";
import { manilaToday } from "@/features/admin/history/data";
import { fetchSale } from "@/features/admin/sales/data";
import { requireStaff } from "@/features/admin/shell/session";

export const metadata: Metadata = { title: "Receipt" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dayOf = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/** One sale's receipt: print it on the receipt printer or A4, start the next sale, or (owner) void it. */
export default async function SalePage({ params, searchParams }: PageProps<"/admin/sales/[id]">) {
  const { supabase, profile } = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const { sale, error } = await fetchSale(supabase, id);
  if (error) {
    return (
      <div className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10">
        <p role="alert" className="auth-alert rounded-2xl px-5 py-4 text-[0.9375rem]">
          We couldn’t load this receipt just now. Refresh the page to try again.
        </p>
      </div>
    );
  }
  if (!sale) notFound();

  const isOwner = profile.role === "owner";
  // Staff reprint today's receipts at the counter; older sales are the owner's.
  if (!isOwner && dayOf(sale.created_at) !== manilaToday()) redirect("/admin/sales");

  const fresh = (await searchParams).new === "1";

  return (
    <div className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10">
      <div data-print="hide" className="mx-auto max-w-[24rem]">
        <Link href="/admin/sales" className="press inline-flex items-center gap-1.5 py-1 text-[0.9375rem] font-semibold text-ink hover:underline">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Sales
        </Link>
        {fresh && !sale.voided_at && (
          <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-ground-2 px-4 py-3 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)]">
            <Check aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.5} />
            Sale recorded. Stock is updated.
          </p>
        )}
        <h1 className="sr-only">Receipt {sale.receipt_number}</h1>
      </div>

      <div className="mt-6">
        <Receipt sale={sale} />
      </div>

      <div data-print="hide" className="mx-auto mt-6 flex max-w-[24rem] flex-col gap-2.5">
        {fresh && (
          <Link
            href="/admin/pos"
            className="press inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-action px-5 text-[1rem] font-semibold text-action-ink hover:bg-action-deep"
          >
            <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} />
            New sale
          </Link>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <PrintButtons primary={!fresh} />
        </div>
        {isOwner && !sale.voided_at && (
          <div className="mt-4 border-t border-line pt-4">
            <VoidSaleButton saleId={sale.id} receiptNumber={sale.receipt_number} />
            <p className="mt-2 text-[0.8125rem] text-ink-2">Rung up by mistake? Voiding puts the items back into stock.</p>
          </div>
        )}
      </div>
    </div>
  );
}
