"use client";

import { useEffect, useRef, useState } from "react";
import { formatPeso } from "@/features/shared/catalog/catalog";
import type { Bucket, SeriesPoint } from "@/lib/admin/sales-report";

/** Clean axis steps: 1, 2, or 5 × a power of ten, about four of them. */
function ticksFor(max: number) {
  if (max <= 0) return [0];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? pow * 10); // whole pesos, no float drift
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

const short = (n: number) => (n >= 10_000 ? `₱${Math.round(n / 1000).toLocaleString("en-PH")}k` : n >= 1000 ? `₱${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : `₱${n}`);

/**
 * Sales per hour, day, or month as one series of columns (no legend: the heading names it).
 * Each column carries its own tooltip on hover and keyboard focus; the table view below holds
 * every value without hovering.
 */
export function SalesChart({ series, bucket }: { series: SeriesPoint[]; bucket: Bucket }) {
  const [active, setActive] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(series.length - 1);
  const [showTable, setShowTable] = useState(false);
  const [width, setWidth] = useState(0);
  const plotRef = useRef<HTMLDivElement>(null);
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const ticks = ticksFor(Math.max(...series.map((s) => s.revenue), 0));
  const top = ticks[ticks.length - 1] || 1;
  // Label every nth column, about one label per 56px of chart, so x-axis text never collides.
  const fits = width ? Math.max(2, Math.floor(width / 56)) : bucket === "hour" ? 13 : 10;
  const every = Math.max(1, Math.ceil(series.length / fits));
  const what = bucket === "hour" ? "hour" : bucket === "day" ? "day" : "month";

  const move = (to: number) => {
    const i = Math.max(0, Math.min(series.length - 1, to));
    setFocusIndex(i);
    setActive(i);
    barRefs.current[i]?.focus();
  };

  return (
    <div>
      <div ref={plotRef} className="relative mt-5 h-[16rem] pl-12" onPointerLeave={() => setActive(null)}>
        {/* Gridlines and y-axis values */}
        {ticks.map((t) => (
          <div key={t} className="absolute inset-x-0 pl-12" style={{ bottom: `calc(1.75rem + (100% - 1.75rem) * ${t / top})` }} aria-hidden="true">
            <span className="tabular absolute left-0 -translate-y-1/2 text-[0.75rem] text-ink-2">{short(t)}</span>
            <div className="h-px w-full bg-line" />
          </div>
        ))}

        <div
          role="group"
          aria-label={`Sales per ${what}. Use the arrow keys to read each ${what}.`}
          className={`absolute inset-x-0 bottom-0 top-0 flex items-end ${series.length > 40 ? "gap-px" : "gap-[2px]"} pb-7 pl-12`}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") move(focusIndex + 1);
            else if (e.key === "ArrowLeft") move(focusIndex - 1);
            else if (e.key === "Home") move(0);
            else if (e.key === "End") move(series.length - 1);
            else return;
            e.preventDefault();
          }}
        >
          {series.map((s, i) => {
            const h = (s.revenue / top) * 100;
            const on = active === i;
            return (
              <div
                key={s.bucket}
                ref={(el) => {
                  barRefs.current[i] = el;
                }}
                role="img"
                tabIndex={i === focusIndex ? 0 : -1}
                aria-label={`${s.label}: ${formatPeso(s.revenue)}, ${s.sales} ${s.sales === 1 ? "sale" : "sales"}`}
                onPointerEnter={() => setActive(i)}
                onFocus={() => {
                  setActive(i);
                  setFocusIndex(i);
                }}
                onBlur={() => setActive(null)}
                className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end outline-none"
              >
                <div
                  className={`sales-bar w-full max-w-6 rounded-t-[4px] transition-opacity duration-150 group-focus-visible:shadow-[0_0_0_2px_var(--amber)] ${on ? "opacity-80" : ""}`}
                  style={{ height: `${h}%`, minHeight: s.revenue > 0 ? 2 : 0 }}
                />
                <span
                  aria-hidden="true"
                  className={`tabular absolute -bottom-6 whitespace-nowrap text-[0.75rem] text-ink-2 ${(series.length - 1 - i) % every === 0 ? "" : "hidden"}`}
                >
                  {s.label}
                </span>
                {on && (
                  <div
                    aria-hidden="true"
                    data-print="hide"
                    className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-left text-ground shadow-[0_6px_18px_-8px_oklch(0.2_0.03_158/0.5)]"
                    style={{ bottom: `calc(${h}% + 0.5rem)`, ...(i > series.length * 0.7 ? { right: 0 } : i < series.length * 0.3 ? { left: 0 } : {}) }}
                  >
                    <p className="tabular text-[0.9375rem] font-semibold leading-tight">{formatPeso(s.revenue)}</p>
                    <p className="text-[0.75rem] leading-tight opacity-80">
                      {s.label} · {s.sales} {s.sales === 1 ? "sale" : "sales"}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        data-print="hide"
        aria-expanded={showTable}
        onClick={() => setShowTable((v) => !v)}
        className="press -mx-1 mt-5 rounded-full px-1 py-1 text-[0.875rem] font-semibold text-ink underline underline-offset-2 hover:decoration-2"
      >
        {showTable ? "Hide the table" : "Show as a table"}
      </button>
      {/* The table view holds every value; it always prints. */}
      <div role="region" aria-label="Sales table" tabIndex={0} className={`${showTable ? "" : "hidden"} report-scroll mt-3 overflow-x-auto outline-offset-2 print:block`}>
        <table className="w-full min-w-[22rem] text-left text-[0.9375rem]">
          <thead>
            <tr>
              <th scope="col" className="voice-label border-b border-line py-2 pr-4 text-[0.8125rem] font-semibold text-ink-2">
                {bucket === "hour" ? "Hour" : bucket === "day" ? "Day" : "Month"}
              </th>
              <th scope="col" className="voice-label border-b border-line py-2 pr-4 text-right text-[0.8125rem] font-semibold text-ink-2">Sales</th>
              <th scope="col" className="voice-label border-b border-line py-2 text-right text-[0.8125rem] font-semibold text-ink-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.bucket}>
                <th scope="row" className="border-b border-line py-2 pr-4 font-normal text-ink">{s.label}</th>
                <td className="tabular border-b border-line py-2 pr-4 text-right text-ink">{s.sales || <span className="text-ink-2">–</span>}</td>
                <td className="tabular border-b border-line py-2 text-right font-semibold text-ink">
                  {s.revenue ? formatPeso(s.revenue) : <span className="font-normal text-ink-2">–</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
