import Link from "next/link";
import { ChevronRight, ReceiptText } from "lucide-react";
import { formatPeso } from "@/lib/admin/catalog";
import { METHOD_LABEL, personName, type SaleSummary, type SalesTotals } from "@/lib/admin/sales";

/** The owner's figures for the period: standing sales only, voids noted apart. */
export function SalesFigures({ totals }: { totals: SalesTotals }) {
  return (
    <>
      <dl className="mb-6 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line py-4 sm:grid-cols-4">
        <Figure label="Sales" value={totals.count.toLocaleString("en-PH")} />
        <Figure label="Total" value={formatPeso(totals.total)} />
        <Figure label="Cash" value={formatPeso(totals.cash)} />
        <Figure label="GCash" value={formatPeso(totals.gcash)} />
      </dl>
      {totals.voided > 0 && (
        <p className="-mt-3 mb-5 text-[0.875rem] text-ink-2">
          {totals.voided} voided {totals.voided === 1 ? "sale isn’t" : "sales aren’t"} counted.
        </p>
      )}
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.8125rem] text-ink-2">{label}</dt>
      <dd className="voice-board tabular mt-1 text-[1.75rem] leading-none text-ink">{value}</dd>
    </div>
  );
}

const TZ = "Asia/Manila";
const dayKey = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const timeOf = (iso: string) => new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
function dayLabel(key: string, today: string, yesterday: string) {
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return new Intl.DateTimeFormat("en-PH", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${key}T00:00:00Z`));
}

/** Sales grouped by Manila day, newest first. Each row opens its receipt. */
export function SalesList({ sales, today, yesterday }: { sales: SaleSummary[]; today: string; yesterday: string }) {
  if (sales.length === 0) {
    return (
      <div className="flex items-start gap-4 py-8">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ground-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]">
          <ReceiptText aria-hidden="true" className="size-6" strokeWidth={1.6} />
        </span>
        <div>
          <p className="text-[1rem] font-semibold text-ink">No sales in this period</p>
          <p className="mt-1 max-w-[52ch] text-[0.9375rem] text-ink-2">Sales rung up in Point of sale show up here, each with its receipt.</p>
        </div>
      </div>
    );
  }

  const days: { key: string; sales: SaleSummary[] }[] = [];
  for (const s of sales) {
    const key = dayKey(s.created_at);
    const last = days[days.length - 1];
    if (last?.key === key) last.sales.push(s);
    else days.push({ key, sales: [s] });
  }

  return (
    <div className="flex flex-col gap-8">
      {days.map((d) => (
        <section key={d.key} aria-label={dayLabel(d.key, today, yesterday)}>
          <h2 className="voice-label border-b border-line pb-2 text-[0.875rem] text-ink-2">{dayLabel(d.key, today, yesterday)}</h2>
          <ol>
            {d.sales.map((s) => {
              const void_ = Boolean(s.voided_at);
              const names = s.itemNames.slice(0, 2).join(", ") + (s.itemNames.length > 2 ? ` +${s.itemNames.length - 2} more` : "");
              return (
                <li key={s.id} className="border-b border-line">
                  <Link
                    href={`/admin/sales/${s.id}`}
                    className="press grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 py-3.5 hover:bg-ground-2/60 lg:grid-cols-[4.5rem_9.5rem_minmax(0,1.6fr)_6rem_minmax(0,1fr)_7rem_1.25rem] lg:items-center"
                  >
                    <time dateTime={s.created_at} className="tabular pt-0.5 text-[0.875rem] text-ink-2 lg:pt-0">
                      {timeOf(s.created_at)}
                    </time>
                    <span className="tabular hidden text-[0.875rem] text-ink-2 lg:block">{s.receipt_number.replace(/^RCPT-\d{8}-/, "#")}</span>
                    <span className="min-w-0 text-[0.9375rem] leading-snug text-ink">
                      <span className={`font-semibold ${void_ ? "line-through decoration-1" : ""}`}>
                        {s.pieces} {s.pieces === 1 ? "piece" : "pieces"}
                      </span>
                      <span className="block truncate text-[0.875rem] text-ink-2">{names}</span>
                    </span>
                    <span
                      className={`tabular row-span-2 self-start text-right text-[1rem] font-semibold text-ink lg:order-last lg:row-span-1 lg:self-center ${
                        void_ ? "text-ink-2 line-through decoration-1" : ""
                      }`}
                    >
                      {formatPeso(s.subtotal)}
                    </span>
                    <span className="col-start-2 text-[0.8125rem] text-ink-2 lg:col-start-auto lg:text-[0.875rem]">
                      {void_ ? (
                        <span className="inline-flex rounded-full px-2 py-0.5 text-[0.75rem] font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--ink)]">Voided</span>
                      ) : (
                        <>
                          {METHOD_LABEL[s.payment_method]}
                          {s.gcash_reference && <span className="tabular"> · {s.gcash_reference.slice(-4)}</span>}
                        </>
                      )}
                      <span className="lg:hidden"> · {personName(s.cashier)}</span>
                    </span>
                    <span className="hidden truncate text-[0.875rem] text-ink-2 lg:block">{personName(s.cashier)}</span>
                    <ChevronRight aria-hidden="true" className="hidden size-4 text-ink-2 lg:order-last lg:block" />
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
