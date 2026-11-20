import {
    CART_MIGRATION,
    cartSummary,
    designRuns,
    designSummary,
    isReadyLine,
    lineState,
    piecesLabel,
    type CartLine,
  } from "@/features/customer/cart/model";
type Removed = { lines: CartLine[]; label: string };

/** What the last change did: a refusal, or Undo for what was just removed. */
export function Status({ message, removed, onUndo, first = false }: { message: string | null; removed: Removed | null; onUndo: () => void; first?: boolean }) {
    return (
      <div aria-live="polite" className={`empty:hidden ${first ? "-mb-8" : ""}`}>
        {message ? (
          <p className={`${first ? "" : "mt-4 "}text-[0.9375rem] font-semibold text-ink`}>{message}</p>
        ) : removed ? (
          <div className={`${first ? "" : "mt-4 "}flex items-center justify-between gap-3 rounded-2xl bg-ground-2 py-2 pl-4 pr-2 shadow-[inset_0_0_0_1px_var(--line)]`}>
            <p className="min-w-0 text-[0.9375rem] text-ink">
              Removed <span className="font-semibold">{removed.label}</span>.
            </p>
            <button
              type="button"
              onClick={onUndo}
              className="press inline-flex h-10 shrink-0 items-center rounded-full px-3 text-[0.9375rem] font-semibold text-ink underline underline-offset-4 hover:bg-ground hover:no-underline"
            >
              Undo
            </button>
          </div>
        ) : null}
      </div>
    );
  }