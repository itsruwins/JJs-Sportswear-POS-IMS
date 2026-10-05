"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, Search } from "lucide-react";
import { personName } from "@/components/admin/orders/order-bits";
import type { InboxRow } from "@/lib/admin/chat";
import { initials, inboxTime } from "./chat-bits";

type Props = {
  rows: InboxRow[];
  migrated: boolean;
  error: boolean;
  nowIso: string;
  migration: string;
  ownerId: string;
  children: React.ReactNode;
};

/**
 * Chat: the inbox beside the open conversation on wide screens. On phones it's one or the
 * other, so an open conversation gets the whole screen and a back link.
 */
export function ChatShell({ rows, migrated, error, nowIso, migration, ownerId, children }: Props) {
  const pathname = usePathname();
  const activeId = pathname.split("/")[3] ?? null;
  const unread = rows.reduce((s, r) => s + r.unread, 0);

  return (
    <div className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10">
      <div className="grid gap-8 lg:grid-cols-[21rem_minmax(0,1fr)] lg:gap-12">
        <aside className={`min-w-0 ${activeId ? "hidden lg:block" : ""}`}>
          <div className="lg:sticky lg:top-24">
            <header className="mb-5">
              <h1 className="voice-display text-[clamp(2.25rem,5vw,3.5rem)]">Chat</h1>
              <p className="mt-2 max-w-[44ch] text-[0.9375rem] text-ink-2">
                {unread > 0
                  ? `${unread} new ${unread === 1 ? "message" : "messages"} from customers.`
                  : "Messages from customers about their orders and anything else."}
              </p>
            </header>
            {!migrated ? (
              <p role="status" className="auth-alert rounded-2xl px-5 py-4 text-[0.9375rem]">
                Chat needs the latest database update ({migration}). Run it in Supabase, then refresh.
              </p>
            ) : error ? (
              <p role="alert" className="auth-alert rounded-2xl px-5 py-4 text-[0.9375rem]">
                We couldn’t load conversations just now. Refresh the page to try again.
              </p>
            ) : (
              <Inbox rows={rows} activeId={activeId} now={new Date(nowIso)} ownerId={ownerId} />
            )}
          </div>
        </aside>
        <div className={`min-w-0 ${activeId ? "" : "hidden lg:block"}`}>{children}</div>
      </div>
    </div>
  );
}

function Inbox({ rows, activeId, now, ownerId }: { rows: InboxRow[]; activeId: string | null; now: Date; ownerId: string }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase().replace(/^@/, "");
  const shown = needle
    ? rows.filter((r) => `${r.full_name ?? ""} ${r.username} ${r.last_order_number ?? ""}`.toLowerCase().includes(needle))
    : rows;

  if (rows.length === 0) {
    return (
      <div className="flex items-start gap-4 py-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ground-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]">
          <MessageCircle aria-hidden="true" className="size-6" strokeWidth={1.6} />
        </span>
        <div>
          <p className="text-[1rem] font-semibold text-ink">No conversations yet</p>
          <p className="mt-1 text-[0.9375rem] text-ink-2">
            When a customer writes to the shop, it shows up here. To start one, open an order and choose “Message”.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {rows.length > 5 && (
        <label className="relative mb-3 block">
          <span className="sr-only">Search conversations</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-2" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or order"
            className="auth-input h-11 pl-10 pr-4 text-[0.9375rem]"
          />
        </label>
      )}
      <ul className="border-t border-line lg:max-h-[calc(100dvh-25rem)] lg:overflow-y-auto">
        {shown.map((r) => {
          const active = r.customer_id === activeId;
          const name = personName(r);
          return (
            <li key={r.customer_id} className="border-b border-line">
              <Link
                href={`/admin/chat/${r.customer_id}`}
                aria-current={active ? "page" : undefined}
                className={`press -mx-2 grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-start gap-x-3 rounded-xl px-2 py-3 ${
                  active ? "bg-ground-2 shadow-[inset_0_0_0_1px_var(--line)]" : "hover:bg-ground-2/60"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`grid size-10 place-items-center rounded-full text-[0.8125rem] font-bold ${
                    r.unread > 0 ? "bg-board text-board-ink" : "bg-ground-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]"
                  }`}
                >
                  {initials(r)}
                </span>
                <span className="min-w-0">
                  <span className={`block truncate text-[0.9375rem] text-ink ${r.unread > 0 ? "font-semibold" : "font-medium"}`}>{name}</span>
                  <span className={`mt-0.5 line-clamp-2 text-[0.875rem] leading-snug ${r.unread > 0 ? "text-ink" : "text-ink-2"}`}>
                    {!r.last_from_customer && <span className="text-ink-2">{r.last_sender_id === ownerId ? "You" : "Shop"}: </span>}
                    {r.last_message}
                  </span>
                  {r.last_order_number && <span className="tabular mt-1 block text-[0.75rem] font-semibold text-ink-2">{r.last_order_number}</span>}
                </span>
                <span className="flex flex-col items-end gap-1.5">
                  <span className="tabular whitespace-nowrap text-[0.75rem] text-ink-2">{inboxTime(r.last_at, now)}</span>
                  {r.unread > 0 && (
                    <span className="tabular grid h-5 min-w-5 place-items-center rounded-full bg-amber px-1.5 text-[0.6875rem] font-bold leading-none text-amber-ink">
                      {r.unread}
                      <span className="sr-only"> unread</span>
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
        {shown.length === 0 && <li className="py-4 text-[0.9375rem] text-ink-2">No conversation matches “{q.trim()}”.</li>}
      </ul>
    </>
  );
}
