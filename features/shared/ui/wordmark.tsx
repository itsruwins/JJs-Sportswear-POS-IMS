import { BrandBadge } from "@/features/shared/ui/brand-badge";

/**
 * The shop's lockup: the round J&J badge, then "Crafts & Sportswear" in the logo's own lettering.
 * `compact` hides the words on phones so only the badge shows.
 */
export function Wordmark({ tone = "ground", compact = false }: { tone?: "ground" | "board"; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5" aria-hidden="true">
      <BrandBadge className="size-9 shrink-0" />
      <span
        className={`voice-brand text-[0.75rem] ${compact ? "hidden sm:inline" : ""} ${
          tone === "board" ? "text-board-ink" : "text-ink"
        }`}
      >
        Crafts &amp; Sportswear
      </span>
    </span>
  );
}
