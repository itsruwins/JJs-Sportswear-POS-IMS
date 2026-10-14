import Link from "next/link";
import { ChevronRight, ImageOff, PenLine, ScanBarcode } from "lucide-react";
import { ago, personName } from "@/features/admin/orders/components/order-parts";
import { formatPeso } from "@/features/shared/catalog/catalog";
import { formatReference } from "@/features/shared/payments/model";
import { COUNTER_VIEWS, type CounterFlag, type CounterPayment, type CounterView } from "@/features/admin/payments/data";
import { CheckCounterPayment } from "./payment-actions";

const EMPTY: Record<CounterView, string> = {
  cashier_confirmed: "Nothing to check. E-payments taken at the counter show up here until you match them against the shop’s account.",
  matched: "No matched e-payments yet.",
  disputed: "No disputed e-payments.",
};

const day = (ymd: string) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${ymd}T00:00:00Z`));

function flagText(f: CounterFlag) {
  switch (f.kind) {
    case "typed":
      return "Typed by hand";
    case "amount_changed":
      return `Receipt showed ${formatPeso(f.receipt)}${f.approver ? `; approved by ${f.approver}` : ""}${f.reason ? `: “${f.reason}”` : ""}`;
    case "reference_changed":
      return `Reference changed from …${f.receipt.slice(-4)}`;
    case "suspicious":
      return "Reader: may be edited";
    case "not_successful":
      return `Receipt said ${f.status === "pending" ? "Pending" : f.status === "failed" ? "Failed" : "no status"}`;
    case "old_receipt":
      return `Receipt dated ${day(f.date)}`;
    case "photo_quality":
      return "Blurry or glared photo";
  }
}

/**
 * The owner's checks for e-payments taken at the counter: the receipt photo, what to look at,
 * and Matched or Disputed. Nothing here is "verified": only the shop's own account can say that.
 */
export function CounterChecks({
  view,
  rows,
  counts,
  more,
  error,
  outdated,
  now,
}: {
  view: CounterView;
  rows: CounterPayment[];
  counts: Record<CounterView, number>;
  more: boolean;
  error: boolean;
  outdated: boolean;
  now: Date;
}) {
  return (
    <>
      <nav aria-label="Check status" className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-1.5">
          {COUNTER_VIEWS.map((v) => {
            const on = v.id === view;
            const n = counts[v.id];
            return (
              <li key={v.id}>
                <Link
                  href={v.id === "cashier_confirmed" ? "/admin/payments?kind=counter" : `/admin/payments?kind=counter&view=${v.id}`}
                  aria-current={on ? "page" : undefined}
                  className={`press inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-[0.875rem] font-semibold ${
                    on ? "bg-ink text-ground" : "text-ink-2 shadow-[inset_0_0_0_1px_var(--line)] hover:text-ink"
                  }`}
                >
                  {v.label}
                  <span className={`tabular text-[0.8125rem] ${on ? "opacity-80" : ""}`}>{n}</span>
                  {v.id === "cashier_confirmed" && n > 0 && !on && <span aria-hidden="true" className="lamp" data-state="live" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {error ? (
        <p role="alert" className="auth-alert rounded-2xl px-5 py-4 text-[0.9375rem]">
          {outdated ? "Counter e-payment checks need the latest database update." : "We couldn’t load the e-payments just now. Refresh the page to try again."}
        </p>
      ) : rows.length === 0 ? (
        <div className="flex items-start gap-4 py-8">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ground-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]">
            <ScanBarcode aria-hidden="true" className="size-6" strokeWidth={1.6} />
          </span>
          <div>
            <p className="text-[1rem] font-semibold text-ink">{view === "cashier_confirmed" ? "All checked" : "Nothing here"}</p>
            <p className="mt-1 max-w-[56ch] text-[0.9375rem] text-ink-2">{EMPTY[view]}</p>
          </div>
        </div>
      ) : (
        <>
          {view === "cashier_confirmed" && (
            <p className="mb-3 max-w-[64ch] text-[0.875rem] text-ink-2">
              Find each one in the shop’s account. Ones with something to look at come first, then the oldest.
            </p>
          )}
          <ul className="border-t border-line">
            {rows.map((p) => (
              <li key={p.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 border-b border-line py-4 lg:grid-cols-[4.5rem_minmax(0,1fr)_auto] lg:items-start">
                {p.photoUrl ? (
                  <a href={p.photoUrl} target="_blank" rel="noreferrer" className="press scan-thumb block" aria-label={`Receipt photo for ${p.receiptNumber}, opens full size`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link to a private photo */}
                    <img src={p.photoUrl} alt="" />
                  </a>
                ) : (
                  <span className="scan-thumb grid place-items-center text-ink-2" title={p.photoExpired ? "Photo removed after 90 days" : "Typed by hand, no photo"}>
                    {p.photoExpired ? <ImageOff aria-hidden="true" className="size-5" /> : <PenLine aria-hidden="true" className="size-5" />}
                  </span>
                )}

                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="text-[1rem] font-semibold text-ink">
                      {p.providerName}
                      {p.reference && <span className="tabular ml-2 font-normal text-ink">{formatReference(p.provider, p.reference)}</span>}
                    </p>
                    <p className="tabular text-[1.125rem] font-semibold text-ink">{formatPeso(p.amount)}</p>
                  </div>
                  <p className="mt-0.5 text-[0.875rem] text-ink-2">
                    <Link href={`/admin/sales/${p.saleId}`} className="tabular inline-flex items-center gap-0.5 font-semibold text-ink hover:underline">
                      {p.receiptNumber}
                      <ChevronRight aria-hidden="true" className="size-3.5" />
                    </Link>{" "}
                    · {p.saleAt ? ago(p.saleAt, now) : ""} · {personName(p.cashier)}
                    {p.recipient && <> · Sent to {p.recipient}</>}
                  </p>
                  {p.flags.length > 0 && (
                    <ul aria-label="To look at" className="mt-2 flex flex-wrap gap-1.5">
                      {p.flags.map((f) => (
                        <li
                          key={f.kind}
                          className={`rounded-[0.875rem] px-2.5 py-0.5 text-[0.8125rem] font-semibold leading-snug ${
                            f.kind === "suspicious" ? "bg-ink text-ground" : "text-ink shadow-[inset_0_0_0_1px_var(--ink)]"
                          }`}
                        >
                          {flagText(f)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {p.check !== "cashier_confirmed" && (
                    <p className="mt-2 text-[0.875rem] text-ink-2">
                      <span className="font-semibold text-ink">{p.check === "matched" ? "Matched" : "Disputed"}</span>
                      {p.checker && <> by {personName(p.checker)}</>}
                      {p.checkedAt && <>, {ago(p.checkedAt, now).toLowerCase()}</>}
                      {p.checkNote && <>: “{p.checkNote}”</>}
                    </p>
                  )}
                </div>

                <div className="col-span-2 lg:col-span-1">
                  <CheckCounterPayment paymentId={p.id} status={p.check} />
                </div>
              </li>
            ))}
          </ul>
          {more && <p className="mt-4 text-[0.875rem] text-ink-2">Showing the first 200 here.</p>}
        </>
      )}
    </>
  );
}
