"use client";

import { useEffect, useState } from "react";
import { FlipText } from "@/features/shared/ui/flip-text";

export type Readout = { label: string; value: number; note: string; alert?: boolean };

/** The shop's live counts on flip cards. They flip in on arrival and flip again when a value changes. */
export function ReadoutBoard({ items }: { items: Readout[] }) {
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setArrived(true), 140);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <section aria-label="The shop at a glance" className="board rounded-[1.75rem] p-5 text-board-ink sm:p-7">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-7 lg:grid-cols-4">
        {items.map((item) => {
          const digits = String(item.value);
          return (
            <div key={item.label} className="min-w-0">
              <dt className="flex items-center gap-2">
                <span className="voice-kicker text-[0.6875rem] text-board-ink-2">{item.label}</span>
                {item.alert && <span className="lamp" data-state="live" aria-hidden="true" />}
              </dt>
              <dd className="mt-2">
                <FlipText
                  text={arrived ? digits : ""}
                  length={Math.max(3, digits.length)}
                  align="end"
                  label={`${item.value}`}
                  className="text-[2.5rem] sm:text-[3rem]"
                />
                <p className="mt-2 text-[0.875rem] leading-snug text-board-ink-2">{item.note}</p>
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
