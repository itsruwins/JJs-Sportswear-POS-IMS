import { BrandBadge } from "@/features/shared/ui/brand-badge";

/**
 * The shop's lockup: the round J&J badge, then "Crafts & Sportswear" in the logo's own lettering.
 * `compact` hides the words on phones so only the badge shows. `bar` is the larger lockup the
 * top bars use (a 55px badge in the 64px bar); elsewhere it stays 36px.
 */
export function Wordmark({ tone = "ground", compact = false, bar = false }: { tone?: "ground" | "board"; compact?: boolean; bar?: boolean }) {
  return (
    <span className={`inline-flex items-center ${bar ? "gap-3" : "gap-2.5"}`} aria-hidden="true">
      <BrandBadge className={`${bar ? "size-[55px]" : "size-9"} shrink-0`} />
      <span
        className={`voice-brand ${bar ? "text-[0.8125rem]" : "text-[0.75rem]"} ${compact ? "hidden sm:inline" : ""} ${
          tone === "board" ? "text-board-ink" : "text-ink"
        }`}
      >
        Crafts &amp; Sportswear
      </span>
    </span>
  );
}
