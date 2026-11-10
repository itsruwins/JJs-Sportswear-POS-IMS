import { Fragment } from "react";
import { formatPeso } from "@/features/shared/catalog/catalog";
import { formatReference } from "@/features/shared/payments/model";
import { personName, type SaleDetail } from "@/features/admin/sales/data";
import { SHOP } from "@/lib/shop";

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(iso));

/**
 * The receipt as a slip of paper: light in both themes, the way it prints. The same markup prints
 * on an 80 mm roll or on A4 (see ReceiptActions), so what's on screen is what the customer gets.
 */
export function Receipt({ sale }: { sale: SaleDetail }) {
  const pieces = sale.lines.reduce((s, l) => s + l.quantity, 0);
  return (
    <article
      aria-label={`Receipt ${sale.receipt_number}`}
      className="receipt relative mx-auto w-full max-w-[24rem] bg-card px-6 py-7 text-[0.875rem] leading-snug text-card-ink shadow-[inset_0_0_0_1px_var(--line)]"
    >
      <header className="text-center">
        <p className="voice-display text-[1.5rem] uppercase leading-none">{SHOP.name}</p>
        {SHOP.address && <p className="mt-1.5">{SHOP.address}</p>}
        <p className={SHOP.address ? undefined : "mt-1.5"}>{SHOP.city}</p>
        {SHOP.phone && <p className="tabular">{SHOP.phone}</p>}
      </header>

      <dl className="receipt-rule mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 pt-4 text-[0.8125rem]">
        <dt className="opacity-70">Receipt</dt>
        <dd className="tabular text-right font-semibold">{sale.receipt_number}</dd>
        <dt className="opacity-70">Date</dt>
        <dd className="tabular text-right">{when(sale.created_at)}</dd>
        <dt className="opacity-70">Cashier</dt>
        <dd className="text-right">{personName(sale.cashier)}</dd>
        {sale.ticketCode && (
          <>
            <dt className="opacity-70">Ticket</dt>
            <dd className="tabular text-right">{sale.ticketCode}</dd>
          </>
        )}
      </dl>

      <ul className="receipt-rule mt-4 pt-3">
        {sale.lines.map((l) => (
          <li key={l.id} className="py-1.5">
            <p className="font-semibold">{l.productName}</p>
            <div className="tabular flex justify-between gap-3">
              <span className="opacity-80">
                {[l.size, l.color].filter(Boolean).join(" · ") || "One size"} · {l.quantity} × {formatPeso(l.unit_price)}
              </span>
              <span>{formatPeso(l.subtotal)}</span>
            </div>
          </li>
        ))}
      </ul>

      <div className="receipt-rule mt-3 pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold">
            Total <span className="font-normal opacity-70">· {pieces} {pieces === 1 ? "piece" : "pieces"}</span>
          </span>
          <span className="voice-board tabular text-[1.75rem] leading-none">{formatPeso(sale.subtotal)}</span>
        </div>
        <dl className="tabular mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
          {sale.payments.map((p, i) => (
            <Fragment key={i}>
              <dt>{p.method === "cash" ? "Cash" : (p.providerName ?? "E-payment")}</dt>
              <dd className="text-right">{formatPeso(p.amount)}</dd>
              {p.reference && (
                <>
                  <dt className="opacity-70">Ref. no.</dt>
                  <dd className="text-right">{formatReference(p.provider, p.reference)}</dd>
                </>
              )}
            </Fragment>
          ))}
          {/* Change is always cash: shown when cash was taken, or when an e-payment ran over. */}
          {(sale.change_amount > 0 || sale.payments.some((p) => p.method === "cash")) && (
            <>
              <dt>Change</dt>
              <dd className="text-right font-semibold">{formatPeso(sale.change_amount)}</dd>
            </>
          )}
        </dl>
      </div>

      {sale.voided_at && (
        <div className="receipt-void mt-5 rounded-lg px-3 py-2.5 text-center">
          <p className="voice-display text-[1.375rem] uppercase leading-none">Voided</p>
          <p className="mt-1 text-[0.8125rem]">
            {when(sale.voided_at)} by {personName(sale.voided_by)}
          </p>
          {sale.void_reason && <p className="mt-0.5 text-[0.8125rem]">“{sale.void_reason}”</p>}
        </div>
      )}

      <footer className="receipt-rule mt-5 pt-4 text-center text-[0.8125rem]">
        <p>{SHOP.thanks}</p>
        <p className="mt-1 opacity-70">{SHOP.notice}</p>
      </footer>
    </article>
  );
}
