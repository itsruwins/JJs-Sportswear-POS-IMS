import Link from "next/link";
import { ChevronRight, Wallet } from "lucide-react";
import { ago, personName } from "@/features/admin/orders/components/order-parts";
import { formatPeso } from "@/features/shared/catalog/catalog";
import { methodLine, PAY_TYPE_LABEL, QUEUE_VIEWS, type QueueRow, type QueueView } from "@/features/admin/payments/data";
import { PayPill } from "./payment-parts";

const EMPTY: Record<QueueView, string> = {
  submitted: "Nothing to review. GCash payments customers send for their custom orders show up here.",
  verified: "No verified payments yet.",
  rejected: "No rejected payments.",
  all: "No payments yet.",
};

type Props = {
  view: QueueView;
  rows: QueueRow[];
  counts: Record<Exclude<QueueView, "all">, number>;
  more: boolean;
  error: boolean;
  now: Date;
};

/** The payments queue: status tabs with counts, then one row per payment. */
export function PaymentQueue({ view, rows, counts, more, error, now }: Props) {
  const total = counts.submitted + counts.verified + counts.rejected;

  return (
    <>
      <nav aria-label="Payment status" className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-1.5">
          {QUEUE_VIEWS.map((v) => {
            const on = v.id === view;
            const n = v.id === "all" ? total : counts[v.id];
            return (
              <li key={v.id}>
                <Link
                  href={v.id === "submitted" ? "/admin/payments" : `/admin/payments?view=${v.id}`}
                  aria-current={on ? "page" : undefined}
                  className={`press inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-[0.875rem] font-semibold ${
                    on ? "bg-ink text-ground" : "text-ink-2 shadow-[inset_0_0_0_1px_var(--line)] hover:text-ink"
                  }`}
                >
                  {v.label}
                  <span className={`tabular text-[0.8125rem] ${on ? "opacity-80" : ""}`}>{n}</span>
                  {v.id === "submitted" && n > 0 && !on && <span aria-hidden="true" className="lamp" data-state="live" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {error ? (
        <p role="alert" className="auth-alert rounded-2xl px-5 py-4 text-[0.9375rem]">
          We couldn’t load the payments just now. Refresh the page to try again.
        </p>
      ) : rows.length === 0 ? (
        <div className="flex items-start gap-4 py-8">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ground-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]">
            <Wallet aria-hidden="true" className="size-6" strokeWidth={1.6} />
          </span>
          <div>
            <p className="text-[1rem] font-semibold text-ink">{view === "submitted" ? "All caught up" : "No payments here"}</p>
            <p className="mt-1 max-w-[56ch] text-[0.9375rem] text-ink-2">{EMPTY[view]}</p>
          </div>
        </div>
      ) : (
        <>
          {view === "submitted" && <p className="mb-3 text-[0.875rem] text-ink-2">Oldest first, so nobody waits longest.</p>}
          <ul className="border-t border-line">
            {rows.map((p) => (
              <li key={p.id} className="border-b border-line">
                <Link
                  href={`/admin/payments/${p.id}`}
                  className="press grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 py-3.5 hover:bg-ground-2/60 lg:grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,1fr)_8rem_7rem_1.25rem] lg:items-center lg:gap-x-6"
                >
                  <span className="min-w-0">
                    <span className="tabular block text-[0.9375rem] font-semibold text-ink">{p.order_number}</span>
                    <span className="block text-[0.8125rem] text-ink-2">{ago(p.created_at, now)}</span>
                  </span>
                  <span className="tabular justify-self-end text-[1rem] font-semibold text-ink lg:order-4 lg:text-right">{formatPeso(p.amount)}</span>
                  <span className="min-w-0 truncate text-[0.9375rem] text-ink lg:order-2">{personName(p.customer)}</span>
                  <span className="justify-self-end lg:order-5 lg:justify-self-start">
                    <PayPill status={p.status} />
                  </span>
                  <span className="col-span-2 text-[0.875rem] text-ink-2 lg:order-3 lg:col-span-1">
                    {PAY_TYPE_LABEL[p.payment_type]} · {methodLine(p, true)}
                  </span>
                  <ChevronRight aria-hidden="true" className="hidden size-4 text-ink-2 lg:order-6 lg:block" />
                </Link>
              </li>
            ))}
          </ul>
          {more && <p className="mt-4 text-[0.875rem] text-ink-2">Showing the latest 300 payments here.</p>}
        </>
      )}
    </>
  );
}
