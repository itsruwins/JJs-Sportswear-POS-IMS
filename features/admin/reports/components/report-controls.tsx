"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { RangePicker, type RangePatch } from "@/features/admin/history/components/range-picker";
import type { HistoryRange } from "@/features/admin/history/data";

/** A page's period, kept in the URL; the default range (30 days on Reports) stays out of it. */
export function ReportPeriod({
  range,
  from,
  to,
  defaultRange = "30d",
}: {
  range: HistoryRange;
  from: string;
  to: string;
  defaultRange?: HistoryRange;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const pick = (patch: RangePatch) => {
    const next = { range, from, to, ...patch };
    // Other parameters (such as the Reports tab) stay as they are.
    const params = new URLSearchParams(window.location.search);
    for (const k of ["range", "from", "to"]) params.delete(k);
    if (next.range !== defaultRange) params.set("range", next.range);
    if (next.range === "custom") {
      params.set("from", next.from);
      params.set("to", next.to);
    }
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  return <RangePicker range={range} from={from} to={to} pending={pending} onPick={pick} />;
}

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="press inline-flex h-11 items-center gap-2 rounded-xl bg-board px-4 text-[0.9375rem] font-semibold text-board-ink hover:bg-board-deep"
    >
      <Printer aria-hidden="true" className="size-[1.125rem]" />
      Print report
    </button>
  );
}
