"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { RangePicker, type RangePatch } from "@/components/admin/history/range-picker";
import type { HistoryRange } from "@/lib/admin/history";

/** The movement summary's period, kept in the URL (30 days is the default). */
export function ReportPeriod({ range, from, to }: { range: HistoryRange; from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const pick = (patch: RangePatch) => {
    const next = { range, from, to, ...patch };
    const params = new URLSearchParams();
    if (next.range !== "30d") params.set("range", next.range);
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
