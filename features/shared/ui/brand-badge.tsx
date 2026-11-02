import { BADGE_COMPACT_LETTERS, BADGE_LETTERS, BADGE_TAGLINE } from "@/features/shared/ui/brand-paths";

/**
 * The official round J&J badge. `compact` drops the tagline and centres the letters, for sizes under ~96px.
 * Size it with a className (`size-9`). Decorative: the link or heading around it carries the name.
 */
export function BrandBadge({ variant = "compact", className }: { variant?: "compact" | "full"; className?: string }) {
  return (
    <svg viewBox="0 0 1000 1000" className={className} aria-hidden="true" focusable="false">
      <circle cx="500" cy="500" r="500" fill="var(--brand)" />
      {variant === "full" ? (
        <path fill="#fff" fillRule="evenodd" d={BADGE_LETTERS + BADGE_TAGLINE} />
      ) : (
        <path fill="#fff" fillRule="evenodd" d={BADGE_COMPACT_LETTERS} />
      )}
    </svg>
  );
}
