import Link from "next/link";
import { ChevronRight, ReceiptText } from "lucide-react";
import { formatPeso } from "@/features/shared/catalog/catalog";
import { paymentName, personName, type OrderMoneyLine, type OrderTotals, type SaleSummary, type SalesTotals } from "@/features/admin/sales/data";
import { combineTotals, SALES_KINDS, type SalesKind, type TimelineEntry } from "@/features/admin/sales/timeline";

/** The owner's figures for the period: standing sales and order money (less refunds), voids noted apart. */
export function SalesFigures({ kind, shelf, orders }: { kind: SalesKind; shelf: SalesTotals | null; orders: OrderTotals | null }) {
  const sum = combineTotals(shelf, orders);
  const net = orders ? Math.round((orders.paid - orders.refunded) * 100) / 100 : 0;
  return (
    <>
      <dl className={`mb-6 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line py-4 ${kind === "all" ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
        {kind === "all" ? (
          <>
            <Figure label="Total" value={formatPeso(sum.total)} wide />
            <Figure label="Shelf sales" value={formatPeso(shelf?.total ?? 0)} note={count(shelf?.count ?? 0, "sale")} />
            <Figure label="Order payments" value={formatPeso(net)} note={count(orders?.payments ?? 0, "payment")} />
          </>
        ) : kind === "shelf" ? (
          <>
            <Figure label="Sales" value={(shelf?.count ?? 0).toLocaleString("en-PH")} />
            <Figure label="Total" value={formatPeso(sum.total)} />
          </>
        ) : (
          <>
            <Figure label="Payments" value={(orders?.payments ?? 0).toLocaleString("en-PH")} />
            <Figure label="Total" value={formatPeso(sum.total)} />
          </>
        )}
        <Figure label="Cash" value={formatPeso(sum.cash)} />
        <Figure label="E-payment" value={formatPeso(sum.e_payment)} />
      </dl>
      {sum.providers.length > 0 && (
        <p className="-mt-3 mb-5 text-[0.875rem] text-ink-2">
          <span className="sr-only">E-payments by provider: </span>
          {sum.providers.map((p, i) => (
            <span key={p.code}>
              {i > 0 && " · "}
              {p.name} <span className="tabular font-semibold text-ink">{formatPeso(p.amount)}</span>
            </span>
          ))}
        </p>
      )}
      {orders && orders.refunds > 0 && (
        <p className="-mt-3 mb-5 text-[0.875rem] text-ink-2">
          <span className="tabular font-semibold text-ink">{formatPeso(orders.refunded)}</span> refunded on custom orders ({count(orders.refunds, "refund")}),
          taken off the total.
        </p>
      )}
      {shelf && shelf.voided > 0 && (
        <p className="-mt-3 mb-5 text-[0.875rem] text-ink-2">
          {shelf.voided} voided {shelf.voided === 1 ? "sale isn’t" : "sales aren’t"} counted.
        </p>
      )}
    </>
  );
}

const count = (n: number, word: string) => `${n.toLocaleString("en-PH")} ${n === 1 ? word : `${word}s`}`;

/** Staff's line above today's list: how many of each. */
export function SalesCount({ kind, sales, payments }: { kind: SalesKind; sales: number; payments: number }) {
  const parts = [kind !== "orders" ? count(sales, "sale") : null, kind !== "shelf" ? count(payments, "order payment") : null].filter(Boolean);
  return <p className="mb-4 text-[0.9375rem] text-ink-2">{parts.join(" and ")} today</p>;
}

function Figure({ label, value, note, wide = false }: { label: string; value: string; note?: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2 sm:col-span-1" : undefined}>
      <dt className="text-[0.8125rem] text-ink-2">{label}</dt>
      <dd className="voice-board tabular mt-1 text-[1.75rem] leading-none text-ink">{value}</dd>
      {note && <dd className="tabular mt-1.5 text-[0.8125rem] text-ink-2">{note}</dd>}
    </div>
  );
}

/** All · Shelf · Orders, kept in the URL beside the period. */
export function SalesFilter({ kind, hrefFor }: { kind: SalesKind; hrefFor: Record<SalesKind, string> }) {
  return (
    <nav aria-label="Show" className="inline-grid grid-cols-3 gap-1 rounded-xl bg-ground-2 p-1 shadow-[inset_0_0_0_1px_var(--line)]">
      {SALES_KINDS.map((k) => (
        <Link
          key={k.id}
          href={hrefFor[k.id]}
          scroll={false}
          aria-current={kind === k.id ? "page" : undefined}
          className={`press inline-flex h-10 items-center justify-center rounded-lg px-5 text-[0.9375rem] font-semibold ${
            kind === k.id ? "bg-ink text-ground" : "text-ink-2 hover:text-ink"
          }`}
        >
          {k.label}
        </Link>
      ))}
    </nav>
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

const EMPTY: Record<SalesKind, { title: string; body: string }> = {
  all: { title: "No sales in this period", body: "Sales rung up in Point of sale, and payments on custom orders, show up here." },
  shelf: { title: "No shelf sales in this period", body: "Sales rung up in Point of sale show up here, each with its receipt." },
  orders: {
    title: "No order payments in this period",
    body: "Down payments taken on the Designs tab, balances paid at pickup, and online payments once verified show up here.",
  },
};

const row =
  "press grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 py-3.5 hover:bg-ground-2/60 lg:grid-cols-[4.5rem_9.5rem_minmax(0,1.6fr)_6rem_minmax(0,1fr)_7rem_1.25rem] lg:items-center";

/** Sales and order money grouped by Manila day, newest first. A sale opens its receipt; an order payment its payment. */
export function SalesList({ entries, kind, today, yesterday }: { entries: TimelineEntry[]; kind: SalesKind; today: string; yesterday: string }) {
  if (entries.length === 0) {
    return (
      <div className="flex items-start gap-4 py-8">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ground-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]">
          <ReceiptText aria-hidden="true" className="size-6" strokeWidth={1.6} />
        </span>
        <div>
          <p className="text-[1rem] font-semibold text-ink">{EMPTY[kind].title}</p>
          <p className="mt-1 max-w-[52ch] text-[0.9375rem] text-ink-2">{EMPTY[kind].body}</p>
        </div>
      </div>
    );
  }

  const days: { key: string; entries: TimelineEntry[] }[] = [];
  for (const e of entries) {
    const key = dayKey(e.at);
    const last = days[days.length - 1];
    if (last?.key === key) last.entries.push(e);
    else days.push({ key, entries: [e] });
  }

  return (
    <div className="flex flex-col gap-8">
      {days.map((d) => (
        <section key={d.key} aria-label={dayLabel(d.key, today, yesterday)}>
          <h2 className="voice-label border-b border-line pb-2 text-[0.875rem] text-ink-2">{dayLabel(d.key, today, yesterday)}</h2>
          <ol>
            {d.entries.map((e) =>
              e.kind === "sale" ? <SaleRow key={`s-${e.sale.id}`} s={e.sale} /> : <OrderRow key={`${e.line.kind}-${e.line.id}`} l={e.line} />,
            )}
          </ol>
        </section>
      ))}
    </div>
  );
}

function SaleRow({ s }: { s: SaleSummary }) {
  const void_ = Boolean(s.voided_at);
  const names = s.itemNames.slice(0, 2).join(", ") + (s.itemNames.length > 2 ? ` +${s.itemNames.length - 2} more` : "");
  return (
    <li className="border-b border-line">
      <Link href={`/admin/sales/${s.id}`} className={row}>
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
              {paymentName(s.payments)}
              {s.payments.length === 1 && s.payments[0].reference && <span className="tabular"> · {s.payments[0].reference.slice(-4)}</span>}
            </>
          )}
          <span className="lg:hidden"> · {personName(s.cashier)}</span>
        </span>
        <span className="hidden truncate text-[0.875rem] text-ink-2 lg:block">{personName(s.cashier)}</span>
        <ChevronRight aria-hidden="true" className="hidden size-4 text-ink-2 lg:order-last lg:block" />
      </Link>
    </li>
  );
}

/** A verified custom-order payment, or a refund: tagged "Order", with the order number where a sale has its receipt number. */
function OrderRow({ l }: { l: OrderMoneyLine }) {
  const refund = l.kind === "refund";
  const what = refund ? "Refund" : l.paymentType === "balance" ? "Balance" : "Down payment";
  const method = l.method === "cash" ? "Cash" : (l.providerName ?? "E-payment");
  return (
    <li className="border-b border-line">
      {/* A payment opens its own page; a refund has none, so it opens the order. */}
      <Link href={refund ? `/admin/orders/${l.orderId}` : `/admin/payments/${l.id}`} className={row}>
        <time dateTime={l.at} className="tabular pt-0.5 text-[0.875rem] text-ink-2 lg:pt-0">
          {timeOf(l.at)}
        </time>
        <span className="tabular hidden truncate text-[0.875rem] text-ink-2 lg:block">{l.orderNumber}</span>
        <span className="min-w-0 text-[0.9375rem] leading-snug text-ink">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold">{what}</span>
            <span className="inline-flex rounded-full px-2 py-0.5 text-[0.75rem] font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]">Order</span>
          </span>
          <span className="block truncate text-[0.875rem] text-ink-2">
            <span className="tabular lg:hidden">{l.orderNumber}</span>
            {l.buyer && (
              <>
                <span className="lg:hidden"> · </span>
                {l.buyer}
              </>
            )}
          </span>
        </span>
        <span className="tabular row-span-2 self-start text-right text-[1rem] font-semibold text-ink lg:order-last lg:row-span-1 lg:self-center">
          {refund ? `−${formatPeso(l.amount)}` : formatPeso(l.amount)}
        </span>
        <span className="col-start-2 text-[0.8125rem] text-ink-2 lg:col-start-auto lg:text-[0.875rem]">
          {method}
          {l.reference && <span className="tabular"> · {l.reference.slice(-4)}</span>}
          <span className="lg:hidden"> · {personName(l.by)}</span>
        </span>
        <span className="hidden truncate text-[0.875rem] text-ink-2 lg:block">{personName(l.by)}</span>
        <ChevronRight aria-hidden="true" className="hidden size-4 text-ink-2 lg:order-last lg:block" />
      </Link>
    </li>
  );
}
