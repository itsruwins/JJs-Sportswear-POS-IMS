"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, ClipboardList, Search, X } from "lucide-react";
import { formatPeso } from "@/features/shared/catalog/catalog";
import type { OrderSummary, OrderView } from "@/lib/admin/orders";
import { personName, StatusPill } from "./order-bits";

/** Orders in the current tab, with a search over order number, customer, and what they asked for. */
export function OrdersList({ orders, ages, emptyNote, view }: { orders: OrderSummary[]; ages: Record<string, string>; emptyNote: string; view: OrderView }) {
  const searchId = useId();
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^@/, "");
    if (!needle) return orders;
    return orders.filter((o) =>
      [o.order_number, o.customer?.username, o.customer?.full_name, o.description, ...o.garments]
        .filter(Boolean)
        .some((t) => t!.toLowerCase().includes(needle)),
    );
  }, [orders, q]);

  return (
    <div>
      <div className="relative w-full sm:max-w-[26rem]">
        <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-[1.125rem] -translate-y-1/2 text-ink-2" />
        <label htmlFor={searchId} className="sr-only">
          Search orders
        </label>
        <input
          id={searchId}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Order number, customer, or item"
          autoComplete="off"
          spellCheck={false}
          className="auth-input pl-11 pr-11"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Clear search"
            className="press absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-ink-2 hover:text-ink"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="flex items-start gap-4 py-8">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ground-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]">
            <ClipboardList aria-hidden="true" className="size-6" strokeWidth={1.6} />
          </span>
          <div>
            <p className="text-[1rem] font-semibold text-ink">{q ? `No orders match “${q.trim()}”` : "No orders here"}</p>
            <p className="mt-1 max-w-[56ch] text-[0.9375rem] text-ink-2">{q ? "Try the order number or the customer’s name." : emptyNote}</p>
          </div>
        </div>
      ) : (
        <ul className="mt-4 border-t border-line">
          {shown.map((o) => (
            <li key={o.id} className="border-b border-line">
              <Link
                href={view === "open" ? `/admin/orders/${o.id}` : `/admin/orders/${o.id}?from=${view}`}
                className="press grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1.5 py-3.5 hover:bg-ground-2/60 lg:grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,1.4fr)_7rem_9rem_1.25rem] lg:items-center lg:gap-x-6"
              >
                <span className="min-w-0">
                  <span className="tabular block text-[0.9375rem] font-semibold text-ink">{o.order_number}</span>
                  <span className="block text-[0.8125rem] text-ink-2">{ages[o.id]}</span>
                </span>
                <span className="col-start-2 row-start-1 justify-self-end lg:order-4 lg:col-start-auto lg:row-start-auto">
                  <StatusPill status={o.status} progress={o.stepsDone} />
                </span>
                <span className="min-w-0 lg:order-2">
                  <span className="block truncate text-[0.9375rem] text-ink">{personName(o.customer)}</span>
                  {(o.team_name || o.needed_by) && (
                    <span className="block truncate text-[0.8125rem] text-ink-2">
                      {[o.team_name, o.needed_by && `Needed ${new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" }).format(new Date(`${o.needed_by}T00:00:00+08:00`))}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </span>
                <span className="col-span-2 min-w-0 text-[0.875rem] text-ink-2 lg:order-3 lg:col-span-1">
                  <span className="block truncate">{o.garments.join(", ") || "No items listed"}</span>
                  <span className="tabular">
                    {o.pieces} {o.pieces === 1 ? "piece" : "pieces"}
                  </span>
                  <span className="tabular lg:hidden"> · {o.total_price !== null ? formatPeso(o.total_price) : "Needs a price"}</span>
                </span>
                <span className="tabular hidden text-right text-[0.9375rem] font-semibold text-ink lg:order-3 lg:block">
                  {o.total_price !== null ? formatPeso(o.total_price) : <span className="font-normal text-ink-2">Needs a price</span>}
                </span>
                <ChevronRight aria-hidden="true" className="hidden size-4 text-ink-2 lg:order-5 lg:block" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
