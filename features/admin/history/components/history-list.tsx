import Link from "next/link";
import type { StockMove } from "@/features/shared/catalog/catalog";

const LABEL: Record<StockMove["transaction_type"], string> = {
  restock: "Restock",
  return: "Return",
  damage: "Damage",
  adjustment: "Recount",
  sale: "Sale",
};

const TZ = "Asia/Manila";
const dayKey = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const timeOf = (iso: string) => new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: TZ }).format(new Date(iso));

function dayLabel(key: string, today: string, yesterday: string) {
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return new Intl.DateTimeFormat("en-PH", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${key}T00:00:00Z`));
}

/** Stock changes grouped by day: who changed what, when, by how much, and why. */
export function HistoryList({ moves, today, yesterday }: { moves: StockMove[]; today: string; yesterday: string }) {
  const days: { key: string; moves: StockMove[] }[] = [];
  for (const m of moves) {
    const key = dayKey(m.created_at);
    const last = days[days.length - 1];
    if (last?.key === key) last.moves.push(m);
    else days.push({ key, moves: [m] });
  }

  return (
    <div className="flex flex-col gap-8">
      {days.map((d) => (
        <section key={d.key} aria-label={dayLabel(d.key, today, yesterday)}>
          <h2 className="voice-label border-b border-line pb-2 text-[0.875rem] text-ink-2">{dayLabel(d.key, today, yesterday)}</h2>
          <ol>
            {d.moves.map((m) => {
              const up = m.quantity > 0;
              const handle = m.actor ? `@${m.actor.username}` : "Someone";
              const who = m.actor?.full_name?.trim() || handle;
              const whoShort = m.actor?.full_name?.trim().split(/\s+/)[0] || handle;
              return (
                <li
                  key={m.id}
                  className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 border-b border-line py-3.5 lg:grid-cols-[4.5rem_minmax(0,1.3fr)_5rem_7rem_minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-center"
                >
                  <time dateTime={m.created_at} className="tabular pt-0.5 text-[0.875rem] text-ink-2 lg:pt-0">
                    {timeOf(m.created_at)}
                  </time>
                  <p className="min-w-0 text-[0.9375rem] leading-snug text-ink">
                    {m.variant?.product ? (
                      <Link href={`/admin/products/${m.variant.product.id}`} className="font-semibold hover:underline">
                        {m.variant.product.name}
                      </Link>
                    ) : (
                      <span className="font-semibold">Removed product</span>
                    )}
                    <span className="block text-[0.875rem] text-ink-2 lg:inline lg:before:content-['_·_']">
                      {[m.variant?.size, m.variant?.color].filter(Boolean).join(" · ")}
                    </span>
                  </p>
                  <span
                    className={`tabular row-span-2 inline-flex h-8 min-w-14 items-center justify-center self-start rounded-lg px-2 text-[0.9375rem] font-semibold text-ink lg:row-span-1 lg:self-center ${
                      up ? "shadow-[inset_0_0_0_1px_var(--line)]" : "bg-ground-2"
                    }`}
                  >
                    <span aria-hidden="true">
                      {up ? "+" : "−"}
                      {Math.abs(m.quantity)}
                    </span>
                    <span className="sr-only">{`${up ? "Added" : "Removed"} ${Math.abs(m.quantity)}`}</span>
                  </span>
                  <span className="tabular col-start-2 text-[0.8125rem] text-ink-2 lg:col-start-auto lg:text-[0.875rem]">
                    <span className="lg:hidden">Stock </span>
                    {m.previous_stock} → <span className="font-semibold text-ink">{m.new_stock}</span>
                    <span className="lg:hidden"> · {whoShort}</span>
                  </span>
                  <p className="col-start-2 min-w-0 text-[0.8125rem] leading-snug text-ink-2 lg:col-start-auto lg:text-[0.875rem]">
                    <span className="font-semibold text-ink">{LABEL[m.transaction_type]}</span>
                    {m.reason ? ` · ${m.reason}` : ""}
                  </p>
                  <p className="hidden truncate text-[0.875rem] text-ink-2 lg:block">{who}</p>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
