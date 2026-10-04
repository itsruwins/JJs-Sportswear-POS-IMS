import Image from "next/image";
import { Shirt } from "lucide-react";
import type { SizeSummary } from "@/lib/admin/catalog";

/** A product's primary photo on a neutral tile, or a garment glyph when it has none. */
export function ProductThumb({ src, name, size = "md" }: { src: string | null; name: string; size?: "md" | "lg" }) {
  const box = size === "lg" ? "aspect-square w-full rounded-[1.5rem]" : "size-14 rounded-2xl";
  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden shadow-[inset_0_0_0_1px_var(--line)] ${
        src ? "bg-[var(--photo-bg)]" : "bg-ground-2"
      } ${box}`}
    >
      {src ? (
        <Image
          src={src}
          alt={size === "lg" ? name : ""}
          fill
          unoptimized
          sizes={size === "lg" ? "(min-width: 1024px) 28rem, 100vw" : "3.5rem"}
          className="object-contain p-[12%]"
        />
      ) : (
        <Shirt aria-hidden="true" className={size === "lg" ? "size-16 text-ink-2" : "size-6 text-ink-2"} strokeWidth={1.6} />
      )}
    </span>
  );
}

/** Stock per size: lit card in stock, amber when a color is low or out (a notch when out), hollow when none are left. */
export function SizeRail({
  sizes,
  compact = false,
  onSelect,
}: {
  sizes: SizeSummary[];
  compact?: boolean;
  /** When set, each size is a button (e.g. to adjust that size's stock). */
  onSelect?: (size: string) => void;
}) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Stock by size">
      {sizes.map((s) => {
        const detail = s.byColor.map((c) => `${c.color} ${c.qty}`).join(", ");
        const label =
          s.state === "zero"
            ? "sold out"
            : s.colorOut
              ? "a color is sold out"
              : s.state === "low"
                ? "running low"
                : "in stock";
        return (
          <li key={s.size}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(s.size)}
                data-stock={s.state}
                data-partial={s.colorOut || undefined}
                title={`${s.size}: ${s.total} (${detail}). Adjust`}
                aria-label={`${s.size}: ${s.total}, ${label}. Adjust ${s.size}`}
                className={`cell press flex flex-col items-center justify-center rounded-lg hover:brightness-95 ${compact ? "h-11 min-w-10 px-1.5" : "h-12 min-w-12 px-2"}`}
              >
                <CellFace size={s.size} total={s.total} />
              </button>
            ) : (
              <span
                data-stock={s.state}
                data-partial={s.colorOut || undefined}
                title={`${s.size}: ${s.total} (${detail})`}
                aria-label={`${s.size}: ${s.total}, ${label}`}
                className={`cell flex flex-col items-center justify-center rounded-lg ${compact ? "h-11 min-w-10 px-1.5" : "h-12 min-w-12 px-2"}`}
              >
                <CellFace size={s.size} total={s.total} />
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function CellFace({ size, total }: { size: string; total: number }) {
  return (
    <>
      <span aria-hidden="true" className="voice-label text-[0.6875rem] leading-none opacity-75">
        {size}
      </span>
      <span aria-hidden="true" className="voice-board tabular mt-0.5 text-[1.25rem] leading-none">
        {total}
      </span>
    </>
  );
}

export function Pill({ tone = "neutral", children }: { tone?: "neutral" | "green" | "amber"; children: React.ReactNode }) {
  const cls =
    tone === "green"
      ? "bg-board text-board-ink"
      : tone === "amber"
        ? "bg-amber text-amber-ink"
        : "bg-ground-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.75rem] font-semibold ${cls}`}>{children}</span>;
}
