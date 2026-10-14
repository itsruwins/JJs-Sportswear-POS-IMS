/** Typographic J&J wordmark: two flip cards hinged on the ampersand. */
export function Wordmark({ tone = "ground", compact = false }: { tone?: "ground" | "board"; compact?: boolean }) {
  const onBoard = tone === "board";
  return (
    <span className="inline-flex items-center gap-2" aria-hidden="true">
      <span className="voice-board inline-flex items-center gap-[3px] text-[1.3rem] leading-none">
        <span
          className={`relative inline-grid h-[1.55rem] w-[1.15rem] place-items-center rounded-[4px] ${
            onBoard ? "bg-card text-card-ink" : "bg-board text-board-ink"
          }`}
        >
          J
          <span className="absolute inset-x-0 top-1/2 h-px bg-black/25" />
        </span>
        <span className={onBoard ? "text-board-ink" : "text-board-text"}>&amp;</span>
        <span
          className={`relative inline-grid h-[1.55rem] w-[1.15rem] place-items-center rounded-[4px] ${
            onBoard ? "bg-card text-card-ink" : "bg-board text-board-ink"
          }`}
        >
          J
          <span className="absolute inset-x-0 top-1/2 h-px bg-black/25" />
        </span>
      </span>
      <span
        className={`voice-label text-[0.9375rem] font-bold uppercase tracking-[0.06em] ${compact ? "hidden sm:inline" : ""} ${
          onBoard ? "text-board-ink" : "text-ink"
        }`}
      >
        Sportswear
      </span>
    </span>
  );
}
