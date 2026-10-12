import { STATUS_TEXT, type OrderStatus } from "@/features/customer/orders/model";

/**
 * Status in the admin's pill language: moving orders are outlined ink, Ready is solid ink,
 * closed ones are muted. Amber is saved for what the customer has to act on (C4: payments).
 */
export function StatusPill({ status }: { status: OrderStatus }) {
  const tone =
    status === "ready"
      ? "bg-ink text-ground"
      : status === "declined" || status === "cancelled" || status === "completed"
        ? "bg-ground-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]"
        : "text-ink shadow-[inset_0_0_0_1.5px_var(--ink)]";
  return (
    <span className={`inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-[0.8125rem] font-semibold ${tone}`}>
      {STATUS_TEXT[status]}
    </span>
  );
}

const TRACK = ["Sent", "Accepted", "In production", "Ready", "Picked up"];
const RANK: Record<OrderStatus, number> = { pending: 0, accepted: 1, in_progress: 2, ready: 3, completed: 4, declined: -1, cancelled: -1 };

/** The order's board: a lamp per stage, passed ones lit, the current one live. Idle when there's no order yet. */
export function StageStrip({ status }: { status: OrderStatus | null }) {
  const rank = status ? RANK[status] : -1;
  const done = status === "completed";
  return (
    <div className="board rounded-[1.25rem] px-4 py-3.5 text-board-ink sm:px-5">
      <ol aria-label="Order progress" className="grid grid-cols-5 gap-2">
        {TRACK.map((label, i) => {
          const passed = rank > i || done;
          const live = rank === i && !done;
          return (
            <li key={label} aria-current={live ? "step" : undefined} className="flex min-w-0 flex-col items-center gap-2 sm:flex-row sm:items-center">
              <span aria-hidden="true" className="lamp shrink-0" data-state={live ? "live" : passed ? "done" : undefined} />
              <span
                className={`flex min-h-[2lh] items-start text-center text-[0.75rem] leading-tight sm:min-h-0 sm:text-left sm:text-[0.8125rem] ${
                  live ? "font-semibold text-board-ink" : passed ? "text-board-ink" : "text-board-ink-2"
                }`}
              >
                {label}
              </span>
              {status && <span className="sr-only">{passed ? ", done" : live ? ", now" : ""}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function shortDate(iso: string) {
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }).format(new Date(iso));
}

/** A needed-by date (yyyy-mm-dd) in words. */
export function dayDate(iso: string) {
  return new Intl.DateTimeFormat("en-PH", { weekday: "short", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${iso}T00:00:00+08:00`));
}
