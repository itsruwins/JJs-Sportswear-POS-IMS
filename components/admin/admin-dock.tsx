"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Ellipsis } from "lucide-react";
import { fetchUnreadChats } from "@/lib/admin/chat";
import { createClient } from "@/lib/supabase/client";
import type { StaffRole } from "@/lib/admin/session";
import { DOCK_SECTIONS, MORE_SECTIONS, visibleTo, type AdminSection } from "./nav";
import { usePopoverOpen } from "./use-popover-open";

function DockIcon({ section, soon = false }: { section: AdminSection; soon?: boolean }) {
  const Icon = section.icon;
  return (
    <span className="admin-dock-icon">
      <Icon aria-hidden="true" className="size-[1.375rem]" strokeWidth={1.9} />
      {soon && <span aria-hidden="true" className="admin-soon-dot" />}
    </span>
  );
}

/** An unbuilt section: dimmed, with a "Coming soon" tip on hover, focus, or tap. */
function SoonItem({ section }: { section: AdminSection }) {
  const [tip, setTip] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      aria-disabled="true"
      aria-label={`${section.label}, coming soon`}
      data-tip={tip ? "on" : undefined}
      onClick={() => {
        setTip(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setTip(false), 1600);
      }}
      className="admin-dock-item"
    >
      <DockIcon section={section} soon />
      <span>{section.label}</span>
      <span aria-hidden="true" className="admin-tip">
        Coming soon
      </span>
    </button>
  );
}

function DockItem({ section, active }: { section: AdminSection; active: boolean }) {
  if (!section.href) return <SoonItem section={section} />;
  return (
    <Link href={section.href} className="admin-dock-item press" aria-current={active ? "page" : undefined}>
      <DockIcon section={section} />
      <span>{section.label}</span>
    </Link>
  );
}

function isActive(href: string | undefined, current: string) {
  if (!href) return false;
  return href === "/admin" ? current === href : current === href || current.startsWith(`${href}/`);
}

/**
 * Unread customer messages for the owner's Chat badge: starts from the server's count and
 * re-counts whenever a message is sent or read anywhere.
 */
function useUnreadChats(userId: string | undefined, initial: number) {
  const [count, setCount] = useState(initial);
  const [seen, setSeen] = useState(initial);
  // A fresh server count (after a refresh or navigation) wins.
  if (initial !== seen) {
    setSeen(initial);
    setCount(initial);
  }
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let timer: number | undefined;
    let seq = 0;
    const recount = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        // Only the latest recount wins, if two overlap.
        const mine = ++seq;
        const n = await fetchUnreadChats(supabase, userId);
        if (n !== null && mine === seq) setCount(n);
      }, 500);
    };
    const channel = supabase
      .channel(`chat-unread-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, recount)
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [userId]);
  return count;
}

/** The admin's navigation: a floating dock on larger screens, a tab bar on phones. */
export function AdminDock({
  role,
  activeHref,
  userId,
  unreadChats = 0,
}: {
  role: StaffRole;
  activeHref?: string;
  /** The owner's id, to keep the Chat badge live. */
  userId?: string;
  unreadChats?: number;
}) {
  const pathname = usePathname();
  const chats = useUnreadChats(role === "owner" ? userId : undefined, unreadChats);
  const current = activeHref ?? pathname;
  const moreRef = useRef<HTMLDivElement>(null);
  const moreOpen = usePopoverOpen(moreRef);
  const more = MORE_SECTIONS.filter(visibleTo(role));
  // On a page that lives behind More (Reports, Staff), More is the current dock item.
  const inMore = more.some((s) => isActive(s.href, current));

  return (
    <nav aria-label="Admin sections" className="admin-dock">
      <ul className="admin-dock-list">
        {DOCK_SECTIONS.map((s) => (
          <li key={s.label} className="flex flex-1 sm:flex-none">
            <DockItem section={s} active={isActive(s.href, current)} />
          </li>
        ))}
        <li className="flex flex-1 sm:flex-none">
          <button
            type="button"
            popoverTarget="admin-more"
            aria-expanded={moreOpen}
            aria-controls="admin-more"
            data-current={inMore ? "true" : undefined}
            className="admin-dock-item press"
          >
            <span className="admin-dock-icon">
              <Ellipsis aria-hidden="true" className="size-[1.375rem]" strokeWidth={1.9} />
              {chats > 0 && <span aria-hidden="true" className="admin-unread-dot" />}
            </span>
            <span>More</span>
            {chats > 0 && <span className="sr-only">, {chats} unread {chats === 1 ? "message" : "messages"}</span>}
          </button>
        </li>
      </ul>

      <div id="admin-more" ref={moreRef} popover="auto" className="admin-pop admin-more" aria-label="More sections">
        <p className="voice-label px-3 pb-1 pt-2 text-[0.8125rem] text-ink-2">More sections</p>
        <ul>
          {more.map((s) => {
            const Icon = s.icon;
            const active = isActive(s.href, current);
            const body = (
              <>
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-xl shadow-[inset_0_0_0_1px_var(--line)] ${
                    active ? "bg-board text-board-ink shadow-none" : s.href ? "bg-ground-2 text-ink" : "bg-ground-2 text-ink-2"
                  }`}
                >
                  <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`flex items-center gap-2 text-[0.9375rem] font-semibold leading-tight ${s.href ? "text-ink" : "text-ink-2"}`}>
                    {s.label}
                    {s.href === "/admin/chat" && chats > 0 && (
                      <span className="tabular grid h-5 min-w-5 place-items-center rounded-full bg-amber px-1.5 text-[0.6875rem] font-bold leading-none text-amber-ink">
                        {chats > 99 ? "99+" : chats}
                        <span className="sr-only"> unread</span>
                      </span>
                    )}
                  </span>
                  <span className="block text-[0.8125rem] leading-snug text-ink-2">{s.description}</span>
                </span>
              </>
            );
            return (
              <li key={s.label}>
                {s.href ? (
                  // Built sections are links; the panel closes as the page changes.
                  <Link
                    href={s.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => moreRef.current?.hidePopover()}
                    className="press flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-ground-2"
                  >
                    {body}
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-2" />
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                    {body}
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-[0.02em] text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]">
                      Soon
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
