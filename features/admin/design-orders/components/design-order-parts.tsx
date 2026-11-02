"use client";

import { Check, Shirt } from "lucide-react";
import { formatPeso } from "@/features/shared/catalog/catalog";
import { MAX_PIECES, sizeRun, type Design, type OrderLine, type Pieces } from "@/features/admin/design-orders/model";

export type Step = "pieces" | "buyer" | "pay";
const STEPS: { id: Step; label: string }[] = [
  { id: "pieces", label: "Pieces" },
  { id: "buyer", label: "Buyer" },
  { id: "pay", label: "Pay" },
];

/** Where the order is: a small board strip with a lamp per step (done lit, current live, the rest idle). */
export function StepStrip({ current, onStep }: { current: Step; onStep: (s: Step) => void }) {
  const at = STEPS.findIndex((s) => s.id === current);
  return (
    <ol aria-label="Order steps" className="board inline-flex items-center gap-1 rounded-full p-1.5 text-board-ink">
      {STEPS.map((s, i) => {
        const done = i < at;
        const live = i === at;
        const body = (
          <>
            <span aria-hidden="true" className="lamp" data-state={live ? "live" : done ? "done" : "idle"} />
            <span className="text-[0.875rem] font-semibold">{s.label}</span>
          </>
        );
        return (
          <li key={s.id}>
            {done ? (
              <button type="button" onClick={() => onStep(s.id)} className="press inline-flex h-9 items-center gap-2 rounded-full px-3 hover:bg-board-deep">
                {body}
                <span className="sr-only">, done. Go back to this step.</span>
              </button>
            ) : (
              <span aria-current={live ? "step" : undefined} className={`inline-flex h-9 items-center gap-2 rounded-full px-3 ${live ? "" : "text-board-ink-2"}`}>
                {body}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** A design's photo on the light backdrop, or its initial while it has none. */
export function DesignPhoto({ src, name, className = "" }: { src: string | null; name: string; className?: string }) {
  return (
    <div className={`overflow-hidden bg-[var(--photo-bg)] ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-contain" loading="lazy" />
      ) : (
        <span aria-hidden="true" className="grid size-full place-items-center text-card-ink/40">
          <Shirt className="size-8" strokeWidth={1.5} />
        </span>
      )}
      <span className="sr-only">{name}</span>
    </div>
  );
}

/** One design in the grid: photo first, then name and starting price; a count when it's in the order. */
export function DesignTile({ design, pieces, onOpen }: { design: Design; pieces: number; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="press group block w-full rounded-[1.125rem] text-left">
      <span className="relative block">
        <DesignPhoto src={design.image} name={design.name} className="aspect-square rounded-[1.125rem]" />
        {pieces > 0 && (
          <span className="tabular absolute right-2 top-2 inline-flex h-7 items-center gap-1 rounded-full bg-ink px-2.5 text-[0.8125rem] font-semibold text-ground">
            <Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
            {pieces}
            <span className="sr-only"> pieces in the order</span>
          </span>
        )}
      </span>
      <span className="mt-2.5 block px-0.5 text-[0.9375rem] font-semibold leading-snug text-ink group-hover:underline">{design.name}</span>
      <span className="tabular block px-0.5 text-[0.875rem] text-ink-2">
        {design.number !== null && <>Design {design.number} · </>}from {formatPeso(design.priceFrom)}
      </span>
    </button>
  );
}

/**
 * How many of each style and size: one block per style with its price, and a run of size cells.
 * A cell takes a typed count; one with pieces wears an ink edge. Counts change the order directly.
 */
export function PiecesEditor({ design, pieces, onChange }: { design: Design; pieces: Pieces; onChange: (variantId: string, qty: number) => void }) {
  return (
    <div className="flex flex-col gap-6">
      {design.styles.map((st) => {
        const count = st.variants.reduce((s, v) => s + (pieces[v.id] ?? 0), 0);
        const amount = st.variants.reduce((s, v) => s + (pieces[v.id] ?? 0) * v.price, 0);
        return (
          <fieldset key={st.name}>
            <legend className="flex w-full items-baseline justify-between gap-4">
              <span className="text-[1rem] font-semibold text-ink">
                {st.name} <span className="tabular font-normal text-ink-2">· {formatPeso(st.price)} each</span>
              </span>
              <span className="tabular text-[0.875rem] text-ink-2">{count > 0 ? `${count} · ${formatPeso(amount)}` : ""}</span>
            </legend>
            <ul className="mt-2.5 grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-1.5">
              {st.variants.map((v) => {
                const qty = pieces[v.id] ?? 0;
                const id = `q-${v.id}`;
                return (
                  <li key={v.id}>
                    <label
                      htmlFor={id}
                      className={`order-cell flex h-[4.25rem] cursor-text flex-col items-center justify-center rounded-[0.875rem] bg-ground-2 ${
                        qty > 0 ? "shadow-[inset_0_0_0_1.5px_var(--ink)]" : "shadow-[inset_0_0_0_1px_var(--line)]"
                      }`}
                    >
                      <span className="voice-label text-[0.75rem] text-ink-2">{v.size}</span>
                      <input
                        id={id}
                        inputMode="numeric"
                        autoComplete="off"
                        value={qty ? String(qty) : ""}
                        placeholder="0"
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const n = Number(e.target.value.replace(/\D/g, "").slice(0, 3));
                          onChange(v.id, Math.min(MAX_PIECES, n));
                        }}
                        aria-label={`${st.name}, size ${v.size}, pieces`}
                        className="voice-board tabular w-full bg-transparent text-center text-[1.375rem] leading-none text-ink outline-none placeholder:text-ink-2/45"
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        );
      })}
    </div>
  );
}

/** The order so far, one group per design: its styles with their size runs and amounts. */
export function OrderSummary({
  lines,
  designs,
  onEdit,
  onRemove,
}: {
  lines: OrderLine[];
  designs: Design[];
  onEdit?: (designId: string) => void;
  onRemove?: (designId: string) => void;
}) {
  const ids = [...new Set(lines.map((l) => l.designId))];
  return (
    <ul className="border-t border-line">
      {ids.map((id) => {
        const mine = lines.filter((l) => l.designId === id);
        const design = designs.find((d) => d.id === id);
        const styles = [...new Set(mine.map((l) => l.style))];
        const sum = mine.reduce((s, l) => s + l.price * l.quantity, 0);
        const count = mine.reduce((s, l) => s + l.quantity, 0);
        return (
          <li key={id} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-4 border-b border-line py-4">
            <DesignPhoto src={design?.image ?? null} name={mine[0].designName} className="size-14 rounded-xl" />
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-[1rem] font-semibold text-ink">{mine[0].designName}</p>
                <p className="tabular shrink-0 text-[0.9375rem] font-semibold text-ink">{formatPeso(sum)}</p>
              </div>
              <ul className="mt-1 text-[0.875rem] leading-relaxed text-ink-2">
                {styles.map((st) => {
                  const run = mine.filter((l) => l.style === st);
                  return (
                    <li key={st}>
                      <span className="text-ink">{st}</span> · <span className="tabular">{sizeRun(run)}</span>
                    </li>
                  );
                })}
              </ul>
              {(onEdit || onRemove) && (
                <div className="mt-2 flex gap-4 text-[0.875rem] font-semibold">
                  {onEdit && (
                    <button type="button" onClick={() => onEdit(id)} className="press text-ink underline underline-offset-4">
                      Change pieces<span className="sr-only"> for {mine[0].designName}</span>
                    </button>
                  )}
                  {onRemove && (
                    <button type="button" onClick={() => onRemove(id)} className="press text-ink-2 hover:text-ink">
                      Remove<span className="sr-only"> {mine[0].designName}, {count} pieces</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
