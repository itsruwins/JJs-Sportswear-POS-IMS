/** The customer pages' content column. */
export const pageShell = "mx-auto w-full max-w-[80rem] px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10";

export function PageHeader({ title, sub }: { title: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <header className="mb-8 sm:mb-10">
      <h1 className="voice-display text-[clamp(2.25rem,5vw,3.5rem)]">{title}</h1>
      {sub && <p className="mt-3 max-w-[48ch] text-[1.0625rem] leading-relaxed text-ink-2">{sub}</p>}
    </header>
  );
}

/**
 * What a tab will hold, while it's still being built. Says so plainly instead of showing
 * controls that go nowhere.
 */
export function NotYetPanel({
  title,
  soon,
  children,
}: {
  title: string;
  /** When it opens, e.g. "Opens in the next update". */
  soon: string;
  children: React.ReactNode;
}) {
  return (
    <section className="max-w-[46rem] rounded-[1.25rem] bg-ground-2 px-5 py-6 shadow-[inset_0_0_0_1px_var(--line)] sm:px-7 sm:py-7">
      <h2 className="text-[1.125rem] font-semibold leading-snug text-ink">{title}</h2>
      <div className="mt-2 max-w-[56ch] text-[0.9375rem] leading-relaxed text-ink-2">{children}</div>
      <p className="voice-label mt-5 inline-flex items-center gap-2 text-[0.8125rem] text-ink-2">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-ink-2" />
        {soon}
      </p>
    </section>
  );
}
