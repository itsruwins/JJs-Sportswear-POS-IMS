"use client";

import { LoaderCircle } from "lucide-react";
import type { HistoryRange } from "@/lib/admin/history";

const RANGES: { id: HistoryRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom" },
];

// Typing a year fires change events for "0002", "0020"…; the inputs stay uncontrolled so typing isn't undone, and only a real date applies.
const fullDate = (v: string) => /^(19|20)\d{2}-\d{2}-\d{2}$/.test(v);

export const filterSelect =
  "h-10 min-w-0 rounded-full bg-ground-2 px-3.5 text-[0.875rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] outline-none focus-visible:shadow-[0_0_0_2px_var(--amber)]";

export type RangePatch = { range?: HistoryRange; from?: string; to?: string };

/** Today / 7 days / 30 days / All time / Custom dates, shared by History and Reports. */
export function RangePicker({
  range,
  from,
  to,
  pending,
  onPick,
}: {
  range: HistoryRange;
  from: string;
  to: string;
  pending?: boolean;
  onPick: (patch: RangePatch) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Date range" className="flex flex-wrap gap-1.5">
        {RANGES.map((r) => {
          const on = range === r.id;
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(r.id === "custom" ? { range: "custom", from: from || to, to } : { range: r.id })}
              className={`press inline-flex h-10 items-center rounded-full px-2.5 text-[0.875rem] font-semibold sm:px-3.5 ${
                on ? "bg-ink text-ground" : "text-ink-2 shadow-[inset_0_0_0_1px_var(--line)] hover:text-ink"
              }`}
            >
              {r.label}
            </button>
          );
        })}
      </div>
      {range === "custom" && (
        <div className="flex flex-wrap items-center gap-2 text-[0.875rem] text-ink-2">
          <label className="flex items-center gap-2">
            From
            <input
              key={from}
              type="date"
              defaultValue={from}
              max={to}
              onChange={(e) => fullDate(e.target.value) && onPick({ range: "custom", from: e.target.value, to })}
              className={filterSelect}
            />
          </label>
          <label className="flex items-center gap-2">
            to
            <input
              key={to}
              type="date"
              defaultValue={to}
              min={from}
              onChange={(e) => fullDate(e.target.value) && onPick({ range: "custom", from, to: e.target.value })}
              className={filterSelect}
            />
          </label>
        </div>
      )}
      {pending && <LoaderCircle aria-label="Updating" className="size-4 animate-spin text-ink-2" />}
    </div>
  );
}
