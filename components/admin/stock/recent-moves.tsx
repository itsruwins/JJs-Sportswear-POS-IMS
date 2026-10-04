import Link from "next/link";
import type { StockMove } from "@/lib/admin/catalog";

const LABEL: Record<StockMove["transaction_type"], string> = {
  restock: "Restock",
  return: "Return",
  damage: "Damage",
  adjustment: "Recount",
  sale: "Sale",
};

const time = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

/** The latest stock changes, so a save is visible in the log right away. */
export function RecentMoves({ moves }: { moves: StockMove[] }) {
  if (moves.length === 0) {
    return <p className="py-6 text-[0.9375rem] text-ink-2">No stock changes yet. Every restock, return, damage, and recount shows up here.</p>;
  }
  return (
    <ol>
      {moves.map((m) => {
        const up = m.quantity > 0;
        const who = m.actor?.full_name?.trim().split(/\s+/)[0] || (m.actor ? `@${m.actor.username}` : "Someone");
        return (
          <li key={m.id} className="flex items-start gap-3 border-b border-line py-3">
            <span
              className={`tabular mt-0.5 inline-flex h-7 min-w-14 items-center justify-center rounded-lg px-2 text-[0.875rem] font-semibold ${
                up ? "text-ink shadow-[inset_0_0_0_1px_var(--line)]" : "bg-ground-2 text-ink"
              }`}
            >
              {up ? "+" : "−"}
              {Math.abs(m.quantity)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.9375rem] leading-snug text-ink">
                {m.variant?.product ? (
                  <Link href={`/admin/products/${m.variant.product.id}`} className="font-semibold hover:underline">
                    {m.variant.product.name}
                  </Link>
                ) : (
                  <span className="font-semibold">Removed product</span>
                )}{" "}
                <span className="text-ink-2">
                  {[m.variant?.size, m.variant?.color].filter(Boolean).join(" · ")}
                </span>
              </p>
              <p className="mt-0.5 text-[0.8125rem] leading-snug text-ink-2">
                {LABEL[m.transaction_type]}
                {m.reason ? ` · ${m.reason}` : ""} ·{" "}
                <span className="tabular whitespace-nowrap">
                  {m.previous_stock} → {m.new_stock}
                </span>
              </p>
              <p className="mt-0.5 text-[0.8125rem] text-ink-2">
                {who} · <time dateTime={m.created_at}>{time.format(new Date(m.created_at))}</time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
