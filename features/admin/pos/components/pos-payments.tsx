"use client";

import { useId, useState } from "react";
import { Camera, PenLine, Plus, X } from "lucide-react";
import { formatPeso } from "@/features/shared/catalog/catalog";
import type { PaymentProvider } from "@/features/shared/payments/model";
import { parseAmount, quickAmounts, roundPeso } from "@/features/admin/pos/amounts";
import type { EPayment } from "@/features/admin/pos/scan";

const outline =
  "press inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2 disabled:opacity-50";
const chip = "press inline-flex h-10 items-center rounded-full px-3.5 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2";

/**
 * How the sale is being paid. One way to start (Cash | E-payment), as it always was; once an
 * e-payment is in, a list of parts with what's still due or the cash change, and Add payment.
 */
export function PosPayments({
  total,
  providers,
  cashOn,
  onCashOn,
  cash,
  onCash,
  ePayments,
  onNew,
  onEdit,
  onRemove,
}: {
  total: number;
  providers: PaymentProvider[];
  /** Whether cash is one of the payments. */
  cashOn: boolean;
  onCashOn: (on: boolean) => void;
  cash: string;
  onCash: (v: string) => void;
  ePayments: EPayment[];
  /** Start a new e-payment through a provider (opens the sheet). */
  onNew: (provider: string) => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const cashId = useId();
  const [adding, setAdding] = useState(false);
  const received = cashOn ? parseAmount(cash) : 0;
  const epay = roundPeso(ePayments.reduce((s, p) => s + p.amount, 0));
  const paid = roundPeso(received + epay);
  const due = roundPeso(total - paid);
  const name = (code: string) => providers.find((p) => p.code === code)?.name ?? code;

  const startNew = (code: string) => {
    setAdding(false);
    onNew(code);
  };

  if (ePayments.length === 0) {
    return (
      <div>
        <div role="group" aria-label="Payment" className="grid grid-cols-2 gap-1 rounded-xl bg-ground-2 p-1 shadow-[inset_0_0_0_1px_var(--line)]">
          {([true, false] as const).map((on) => (
            <button
              key={String(on)}
              type="button"
              aria-pressed={cashOn === on}
              onClick={() => {
                onCashOn(on);
                setAdding(false);
              }}
              className={`press h-10 rounded-lg text-[0.9375rem] font-semibold ${cashOn === on ? "bg-ink text-ground" : "text-ink-2 hover:text-ink"}`}
            >
              {on ? "Cash" : "E-payment"}
            </button>
          ))}
        </div>

        {cashOn ? (
          <div className="mt-4">
            <label htmlFor={cashId} className="text-[0.875rem] font-semibold text-ink">
              Cash received
            </label>
            <CashField id={cashId} value={cash} onChange={onCash} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[total, ...quickAmounts(total)].map((a, i) => (
                <button key={a} type="button" onClick={() => onCash(String(a))} className={`${outline} tabular h-9 rounded-full px-3 text-[0.875rem]`}>
                  {i === 0 ? "Exact" : formatPeso(a)}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-baseline justify-between gap-4">
              <span className="text-[0.9375rem] font-semibold text-ink">Change</span>
              {cash === "" ? (
                <span className="text-[0.9375rem] text-ink-2">—</span>
              ) : received >= total ? (
                <span className="voice-board tabular text-[1.75rem] leading-none text-ink">{formatPeso(roundPeso(received - total))}</span>
              ) : (
                <span className="tabular text-[0.9375rem] font-semibold text-ink">Short by {formatPeso(due)}</span>
              )}
            </div>
            {/* Part cash, part e-payment: the rest goes on a bank or e-wallet. */}
            {received > 0 && received < total && providers.length > 0 && (
              <div className="mt-3 border-t border-line pt-3">
                {adding ? (
                  <ProviderChips providers={providers} label={`Pay the ${formatPeso(due)} rest with`} onPick={startNew} />
                ) : (
                  <button type="button" onClick={() => setAdding(true)} className="press -ml-1 inline-flex h-10 items-center gap-1.5 rounded-full px-2 text-[0.9375rem] font-semibold text-ink hover:bg-ground-2">
                    <Plus aria-hidden="true" className="size-4" />
                    Pay the rest by e-payment
                  </button>
                )}
              </div>
            )}
          </div>
        ) : providers.length === 0 ? (
          <p role="alert" className="auth-alert mt-4 rounded-xl px-4 py-3 text-[0.9375rem]">
            We couldn’t load the banks and e-wallets. Refresh the page to try again; cash works in the meantime.
          </p>
        ) : (
          <div className="mt-4">
            <ProviderChips providers={providers} label="Paid with" onPick={startNew} />
            <p className="mt-2 text-[0.8125rem] text-ink-2">Pick one, then photograph the customer’s receipt.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <h3 className="voice-label text-[0.8125rem] uppercase text-ink-2">Payments</h3>
      <ul className="mt-1.5 divide-y divide-line border-y border-line">
        {ePayments.map((p) => (
          <li key={p.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit(p.id)}
              className="press -ml-2 flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 text-left hover:bg-ground-2"
            >
              {p.source === "scan" ? (
                <Camera aria-label="Read from the receipt" className="size-4 shrink-0 text-ink-2" />
              ) : (
                <PenLine aria-label="Typed" className="size-4 shrink-0 text-ink-2" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9375rem] font-semibold text-ink">{name(p.provider)}</span>
                <span className="tabular block text-[0.8125rem] text-ink-2">Ref. …{p.reference.slice(-4)}</span>
              </span>
              <span className="tabular text-[1rem] font-semibold text-ink">{formatPeso(p.amount)}</span>
            </button>
            <button
              type="button"
              onClick={() => onRemove(p.id)}
              className="press grid size-10 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-ground-2 hover:text-ink"
            >
              <X aria-hidden="true" className="size-4" />
              <span className="sr-only">
                Remove the {name(p.provider)} payment of {formatPeso(p.amount)}
              </span>
            </button>
          </li>
        ))}
        {cashOn && (
          <li className="flex items-center gap-1 py-2">
            <label htmlFor={cashId} className="w-16 shrink-0 text-[0.9375rem] font-semibold text-ink">
              Cash
            </label>
            <div className="min-w-0 flex-1">
              <CashField id={cashId} value={cash} onChange={onCash} compact />
            </div>
            <button
              type="button"
              onClick={() => onCashOn(false)}
              className="press grid size-10 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-ground-2 hover:text-ink"
            >
              <X aria-hidden="true" className="size-4" />
              <span className="sr-only">Remove the cash payment</span>
            </button>
          </li>
        )}
      </ul>

      <div className="mt-3 flex items-baseline justify-between gap-4">
        {due > 0 ? (
          <>
            <span className="text-[0.9375rem] font-semibold text-ink">Still due</span>
            <span className="voice-board tabular text-[1.75rem] leading-none text-ink">{formatPeso(due)}</span>
          </>
        ) : due < 0 ? (
          <>
            <span className="text-[0.9375rem] font-semibold text-ink">Change (cash)</span>
            <span className="voice-board tabular text-[1.75rem] leading-none text-ink">{formatPeso(-due)}</span>
          </>
        ) : (
          <span className="text-[0.9375rem] font-semibold text-ink">Paid in full</span>
        )}
      </div>

      <div className="mt-3">
        {adding ? (
          <div className="rounded-xl bg-ground-2 p-3 shadow-[inset_0_0_0_1px_var(--line)]">
            {!cashOn && (
              <button
                type="button"
                onClick={() => {
                  onCashOn(true);
                  if (due > 0) onCash(String(due));
                  setAdding(false);
                }}
                className={`${chip} mb-3 bg-ground`}
              >
                Cash{due > 0 && <span className="tabular ml-1.5 font-normal text-ink-2">{formatPeso(due)}</span>}
              </button>
            )}
            <ProviderChips providers={providers} label="E-payment" onPick={startNew} />
            <button type="button" onClick={() => setAdding(false)} className="press mt-2 -ml-1 h-9 rounded-full px-2 text-[0.875rem] font-semibold text-ink-2 hover:text-ink">
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className={`${outline} h-10 rounded-full px-4 text-[0.9375rem]`}>
            <Plus aria-hidden="true" className="size-4" />
            Add payment
          </button>
        )}
      </div>
    </div>
  );
}

function CashField({ id, value, onChange, compact }: { id: string; value: string; onChange: (v: string) => void; compact?: boolean }) {
  return (
    <div className={`relative ${compact ? "" : "mt-1.5"}`}>
      <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[1rem] text-ink-2">
        ₱
      </span>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
        placeholder="0"
        className={`auth-input tabular pl-9 pr-4 ${compact ? "h-11 text-[1rem]" : "text-[1.125rem]"}`}
      />
    </div>
  );
}

function ProviderChips({ providers, label, onPick }: { providers: PaymentProvider[]; label: string; onPick: (code: string) => void }) {
  const id = useId();
  return (
    <div>
      <p id={id} className="text-[0.875rem] font-semibold text-ink">
        {label}
      </p>
      <div role="group" aria-labelledby={id} className="mt-1.5 flex flex-wrap gap-1.5">
        {providers.map((p) => (
          <button key={p.code} type="button" onClick={() => onPick(p.code)} className={chip}>
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}
