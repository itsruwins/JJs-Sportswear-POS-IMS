import type { Metadata } from "next";
import { LiveRefresh } from "@/features/shared/ui/live-refresh";
import { PaymentQueue } from "@/components/admin/payments/payment-queue";
import { fetchPaymentQueue, QUEUE_VIEWS, type QueueView } from "@/lib/admin/payments";
import { requireStaff } from "@/lib/admin/session";

export const metadata: Metadata = { title: "Payments · J&J Sportswear Admin" };

/** Custom-order payments: what customers sent and is waiting to be checked, and everything already checked. */
export default async function PaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  const { supabase } = await requireStaff();
  const raw = (await searchParams).view;
  const view = (QUEUE_VIEWS.some((v) => v.id === raw) ? raw : "submitted") as QueueView;
  const { rows, more, counts, error } = await fetchPaymentQueue(supabase, view);

  return (
    <div className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10">
      <LiveRefresh tables={["payments", "custom_orders"]} />
      <header className="mb-6">
        <h1 className="voice-display text-[clamp(2.25rem,5vw,3.5rem)]">Payments</h1>
        <p className="mt-2 max-w-[60ch] text-[0.9375rem] text-ink-2">
          Check the GCash payments customers send for custom orders. Money received at the counter is recorded on the order itself.
        </p>
      </header>
      <PaymentQueue view={view} rows={rows} counts={counts} more={more} error={!!error} now={new Date()} />
    </div>
  );
}
