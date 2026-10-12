"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { HistoryFilters as Filters, HistoryType } from "@/features/admin/history/data";
import { filterSelect as select, RangePicker } from "./range-picker";

const TYPES: { id: HistoryType; label: string }[] = [
  { id: "all", label: "All changes" },
  { id: "restock", label: "Restocks" },
  { id: "return", label: "Returns" },
  { id: "damage", label: "Damage" },
  { id: "adjustment", label: "Recounts" },
  { id: "sale", label: "Sales" },
];

/** History filters live in the URL, so a filtered view survives a refresh and can be shared. */
export function HistoryFilters({
  filters,
  products,
  staff,
}: {
  filters: Filters;
  products: { id: string; name: string }[];
  staff: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const go = (patch: Partial<Record<keyof Filters, string>>) => {
    const next: Record<string, string> = {
      range: filters.range,
      type: filters.type,
      product: filters.product,
      staff: filters.staff,
      ...(filters.range === "custom" ? { from: filters.from, to: filters.to } : {}),
      ...patch,
    };
    if (next.range !== "custom") {
      delete next.from;
      delete next.to;
    }
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      const isDefault = (k === "range" && v === "7d") || (k === "type" && v === "all") || !v;
      if (!isDefault) params.set(k, v);
    }
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const filtered = filters.type !== "all" || filters.product || filters.staff || filters.range !== "7d";

  return (
    <div className="flex flex-col gap-3">
      <RangePicker range={filters.range} from={filters.from} to={filters.to} pending={pending} onPick={go} />

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <label className="sr-only" htmlFor="h-type">
          Kind of change
        </label>
        <select id="h-type" value={filters.type} onChange={(e) => go({ type: e.target.value })} className={`${select} w-full sm:w-auto`}>
          {TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="h-product">
          Product
        </label>
        <select id="h-product" value={filters.product} onChange={(e) => go({ product: e.target.value })} className={`${select} order-first col-span-2 w-full sm:order-none sm:w-auto sm:max-w-[16rem]`}>
          <option value="">All products</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="h-staff">
          Staff member
        </label>
        <select id="h-staff" value={filters.staff} onChange={(e) => go({ staff: e.target.value })} className={`${select} w-full sm:w-auto`}>
          <option value="">Everyone</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {filtered && (
          <button
            type="button"
            onClick={() => startTransition(() => router.replace(pathname, { scroll: false }))}
            className="press col-span-2 h-10 justify-self-start rounded-full px-3.5 text-[0.875rem] font-semibold text-ink-2 underline-offset-2 hover:text-ink hover:underline"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
