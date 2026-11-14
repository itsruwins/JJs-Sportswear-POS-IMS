import type { Garment } from "@/features/landing/sample-data";

/** Small garment silhouettes for the stock table. */
export function GarmentIcon({ garment, className = "" }: { garment: Garment; className?: string }) {
  const paths: Record<Garment, string> = {
    jersey: "M15 6 L21 6 Q24 15 27 6 L33 6 Q34 15 39 19 L38 42 Q24 44 10 42 L9 19 Q14 15 15 6 Z",
    tee: "M17 7 Q24 12 31 7 L42 13 L38 21 L34 19 L34 42 L14 42 L14 19 L10 21 L6 13 Z",
    shorts: "M10 9 L38 9 L41 39 L28 41 L24 22 L20 41 L7 39 Z",
    jacket: "M18 6 L24 9 L30 6 L41 12 L43 40 L36 41 L35 22 L35 42 L13 42 L13 22 L12 41 L5 40 L7 12 Z",
  };
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path d={paths[garment]} fill="currentColor" />
      {garment === "jacket" && <path d="M24 9 L24 42" stroke="var(--board)" strokeWidth="1.5" />}
      {garment === "shorts" && <path d="M10 13 L38 13" stroke="var(--board)" strokeWidth="1.5" />}
    </svg>
  );
}
