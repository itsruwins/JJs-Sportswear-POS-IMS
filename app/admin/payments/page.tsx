import type { Metadata } from "next";
import Link from "next/link";
import { LiveRefresh } from "@/features/shared/ui/live-refresh";
import { PaymentQueue } from "@/features/admin/payments/components/payment-queue";
import { CounterChecks } from "@/features/admin/payments/components/payment-counter";
import { COUNTER_VIEWS, countCounterToCheck, fetchCounterPayments, fetchPaymentQueue, QUEUE_VIEWS, type CounterView, type QueueView } from "@/features/admin/payments/data";
import { requireStaff } from "@/features/admin/shell/session";

export const metadata: Metadata = { title: "Payments · J&J Sportswear Admin" };

/**
 * Money waiting on the shop: custom-order payments customers sent, and (for the owner) the
 * e-payments taken at the counter, to match against the shop's account.
 */
export default async function PaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  const { supabase, profile } = await requireStaff();
  const params = await searchParams;
  const owner = profile.role === "owner";
  const counter = owner && params.kind === "counter";

  const header = (
    <header className="mb-6">
      <h1 className="voice-display text-[clamp(2.25rem,5vw,3.5rem)]">Payments</h1>
      <p className="mt-2 max-w-[60ch] text-[0.9375rem] text-ink-2">
        {counter
          ? "Match each e-payment taken at the counter against the shop’s bank or e-wallet. A receipt on a phone isn’t proof the money arrived."
          : "Check the e-payments customers send for custom orders. Money received at the counter is recorded on the order itself."}
      </p>
    </header>
  );

  if (counter) {
    const raw = params.view;
    const view = (COUNTER_VIEWS.some((v) => v.id === raw) ? raw : "cashier_confirmed") as CounterView;
    const [checks, queue] = await Promise.all([fetchCounterPayments(supabase, view), fetchPaymentQueue(supabase, "submitted")]);
    return (
      <div className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10">
        <LiveRefresh tables={["sale_payments", "payments"]} />
        {header}
        <KindSwitch counter orders={queue.counts.submitted} counterCount={checks.counts.cashier_confirmed} />
        <CounterChecks view={view} rows={checks.rows} counts={checks.counts} more={checks.more} error={!!checks.error} outdated={checks.outdated} now={new Date()} />
      </div>
    );
  }

  const raw = params.view;
  const view = (QUEUE_VIEWS.some((v) => v.id === raw) ? raw : "submitted") as QueueView;
  const [{ rows, more, counts, error }, toCheck] = await Promise.all([fetchPaymentQueue(supabase, view), owner ? countCounterToCheck(supabase) : 0]);

  return (
    <div className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10">
      <LiveRefresh tables={["payments", "custom_orders"]} />
      {header}
      {owner && <KindSwitch counter={false} orders={counts.submitted} counterCount={toCheck} />}
      <PaymentQueue view={view} rows={rows} counts={counts} more={more} error={!!error} now={new Date()} />
    </div>
  );
}

/** Owner: custom-order payments or counter e-payments, each with what's waiting. */
function KindSwitch({ counter, orders, counterCount }: { counter: boolean; orders: number; counterCount: number }) {
  const item = (on: boolean, href: string, label: string, n: number) => (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`press inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-[0.9375rem] font-semibold sm:flex-none ${
        on ? "bg-ink text-ground" : "text-ink-2 hover:text-ink"
      }`}
    >
      {label}
      {n > 0 && <span className={`tabular rounded-full px-1.5 text-[0.75rem] ${on ? "bg-ground/20" : "bg-amber text-amber-ink"}`}>{n}</span>}
    </Link>
  );
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Payments" className="flex w-full rounded-xl bg-ground-2 p-1 shadow-[inset_0_0_0_1px_var(--line)] sm:inline-flex sm:w-auto">
        {item(!counter, "/admin/payments", "Custom orders", orders)}
        {item(counter, "/admin/payments?kind=counter", "Counter e-payments", counterCount)}
      </nav>
      <Link href="/admin/payments/accounts" className="press inline-flex h-10 items-center rounded-full px-3.5 text-[0.875rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2">
        Shop accounts
      </Link>
    </div>
  );
}
