import { STATUS_LABEL, type OrderStatus } from "@/lib/admin/orders";

/**
 * An order's status. Amber marks the one state waiting on the shop (a new order to review);
 * the rest are ink, filled once the order is ready to hand over, muted once it's closed.
 */
export function StatusPill({ status, progress }: { status: OrderStatus; progress?: number }) {
  const base = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.75rem] font-semibold";
  const tone =
    status === "pending"
      ? "bg-amber text-amber-ink"
      : status === "ready"
        ? "bg-ink text-ground"
        : status === "accepted" || status === "in_progress"
          ? "text-ink shadow-[inset_0_0_0_1px_var(--ink)]"
          : "bg-ground-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]";
  return (
    <span className={`${base} ${tone}`}>
      {STATUS_LABEL[status]}
      {status === "in_progress" && progress !== undefined && <span className="tabular font-normal">· {progress}/5</span>}
    </span>
  );
}

const TZ = "Asia/Manila";

/** "3 h ago", "Yesterday", "Oct 2". Server-rendered, so it reads the same on every device. */
export function ago(iso: string, now = new Date()) {
  const mins = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: TZ }).format(new Date(iso));
}

export function when(iso: string) {
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
}

export function personName(p: { username: string; full_name: string | null } | null) {
  return p?.full_name?.trim() || (p ? `@${p.username}` : "Unknown customer");
}
