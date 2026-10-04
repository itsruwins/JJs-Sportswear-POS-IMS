"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, ClipboardList, MessageCircle, TriangleAlert, Wallet, X, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { usePopoverOpen } from "./use-popover-open";

type Notification = {
  id: string;
  title: string;
  message: string | null;
  type: string;
  reference_id: string | null;
  is_read: boolean;
  created_at: string;
};

const ICONS: Record<string, LucideIcon> = {
  low_stock: TriangleAlert,
  custom_order: ClipboardList,
  order_status: ClipboardList,
  payment: Wallet,
  chat: MessageCircle,
};

const PAGE = 20;
const TOAST_MS = 6000;

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function ago(iso: string) {
  const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (s > -45) return "Just now";
  const m = Math.round(s / 60);
  if (m > -60) return rtf.format(m, "minute");
  const h = Math.round(m / 60);
  if (h > -24) return rtf.format(h, "hour");
  const d = Math.round(h / 24);
  if (d > -7) return rtf.format(d, "day");
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" }).format(new Date(iso));
}

/** The admin's notifications: a bell with an unread count, a list, and brief pop-ups as alerts arrive. */
export function NotificationBell({ userId }: { userId: string }) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const open = usePopoverOpen(panelRef);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [toasts, setToasts] = useState<Notification[]>([]);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [list, count] = await Promise.all([
      supabase
        .from("notifications")
        .select("id, title, message, type, reference_id, is_read, created_at")
        .order("created_at", { ascending: false })
        .limit(PAGE),
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("is_read", false),
    ]);
    if (list.error || count.error) {
      setFailed(true);
    } else {
      setItems(list.data as Notification[]);
      setUnread(count.count ?? 0);
      setFailed(false);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const first = window.setTimeout(load, 0);
    const channel = supabase
      .channel(`notifications-${userId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as Notification;
          setItems((prev) => [n, ...prev.filter((p) => p.id !== n.id)].slice(0, PAGE));
          setUnread((u) => u + 1);
          setToasts((t) => [n, ...t].slice(0, 3));
        },
      )
      .subscribe();
    return () => {
      window.clearTimeout(first);
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  // Refresh the list whenever it's opened, so it's right even if a live update was missed.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(load, 0);
    return () => window.clearTimeout(t);
  }, [open, load]);

  const markRead = async (ids: string[]) => {
    if (!ids.length) return;
    setItems((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, is_read: true } : n)));
    setUnread((u) => Math.max(0, u - ids.length));
    setToasts((t) => t.map((n) => (ids.includes(n.id) ? { ...n, is_read: true } : n)));
    const { error } = await createClient().from("notifications").update({ is_read: true }).in("id", ids);
    if (error) load();
  };

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
    const { error } = await createClient().from("notifications").update({ is_read: true }).eq("is_read", false);
    if (error) load();
  };

  /** Where a notification leads. Low stock opens the product; other kinds get destinations as their sections arrive. */
  const openTarget = async (n: Notification) => {
    if (n.type === "low_stock" && n.reference_id) {
      const { data } = await createClient().from("product_variants").select("product_id").eq("id", n.reference_id).maybeSingle();
      if (data?.product_id) {
        panelRef.current?.hidePopover();
        router.push(`/admin/products/${data.product_id}`);
      }
    }
  };

  const activate = (n: Notification) => {
    // Check the list's copy: a toast may still hold the unread version of one already read there.
    const current = items.find((x) => x.id === n.id) ?? n;
    if (!current.is_read) markRead([n.id]);
    openTarget(n);
  };

  const dismissToast = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  return (
    <>
      <button
        type="button"
        popoverTarget="admin-notifications"
        aria-expanded={open}
        aria-controls="admin-notifications"
        className="press relative grid size-10 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-ground-2 hover:text-ink"
      >
        <Bell aria-hidden="true" className="size-[1.2rem]" strokeWidth={1.9} />
        <span className="sr-only">Notifications{unread ? `, ${unread} unread` : ""}</span>
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="tabular absolute right-0.5 top-0.5 grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full bg-amber px-1 text-[0.6875rem] font-bold leading-none text-amber-ink shadow-[0_0_0_2px_var(--ground)]"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <div id="admin-notifications" ref={panelRef} popover="auto" role="dialog" className="admin-pop admin-notifications" aria-label="Notifications">
        <div className="flex items-center justify-between gap-3 px-3 pb-2 pt-2">
          <p className="text-[1rem] font-semibold text-ink">Notifications</p>
          {unread > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="press inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[0.8125rem] font-semibold text-ink-2 hover:text-ink"
            >
              <CheckCheck aria-hidden="true" className="size-4" />
              Mark all as read
            </button>
          )}
        </div>
        <div className="max-h-[min(28rem,70dvh)] overflow-y-auto border-t border-line">
          {!loaded ? (
            <p className="px-3 py-6 text-[0.875rem] text-ink-2">Loading…</p>
          ) : failed ? (
            <p className="px-3 py-6 text-[0.875rem] text-ink-2">
              We couldn’t load notifications.{" "}
              <button type="button" onClick={load} className="font-semibold text-ink underline">
                Try again
              </button>
            </p>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-[0.875rem] leading-relaxed text-ink-2">
              No notifications yet. Low-stock alerts show up here, and orders and payments will too as those sections open.
            </p>
          ) : (
            <ul>
              {items.map((n) => {
                const Icon = ICONS[n.type] ?? Bell;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => activate(n)}
                      className="press flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left hover:bg-ground-2"
                    >
                      <span
                        className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${
                          n.type === "low_stock" ? "bg-amber text-amber-ink" : "bg-ground-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]"
                        }`}
                      >
                        <Icon aria-hidden="true" className="size-4" strokeWidth={2} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[0.9375rem] leading-snug text-ink ${n.is_read ? "" : "font-semibold"}`}>{n.title}</span>
                        {n.message && <span className="mt-0.5 block text-[0.875rem] leading-snug text-ink-2">{n.message}</span>}
                        <span className="mt-1 block text-[0.75rem] text-ink-2">{ago(n.created_at)}</span>
                      </span>
                      {!n.is_read && (
                        <span className="mt-2 size-2 shrink-0 rounded-full bg-ink">
                          <span className="sr-only">Unread</span>
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Brief pop-ups for alerts that arrive while you work. */}
      <div aria-live="polite" className="admin-toasts">
        {toasts.map((n) => (
          <Toast
            key={n.id}
            n={n}
            onDismiss={dismissToast}
            onOpen={() => {
              dismissToast(n.id);
              activate(n);
            }}
          />
        ))}
      </div>
    </>
  );
}

function Toast({ n, onDismiss, onOpen }: { n: Notification; onDismiss: (id: string) => void; onOpen: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  // onDismiss is stable, so the countdown only restarts when hover or focus pauses it.
  useEffect(() => {
    if (paused) return;
    const t = window.setTimeout(() => onDismiss(n.id), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [paused, onDismiss, n.id]);
  const Icon = ICONS[n.type] ?? Bell;
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setFocused(false)}
      className="admin-toast flex items-start gap-3 rounded-2xl bg-ground p-3 pr-2"
    >
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-lg ${
          n.type === "low_stock" ? "bg-amber text-amber-ink" : "bg-ground-2 text-ink-2"
        }`}
      >
        <Icon aria-hidden="true" className="size-4" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.9375rem] font-semibold leading-snug text-ink">{n.title}</p>
        {n.message && <p className="mt-0.5 text-[0.875rem] leading-snug text-ink-2">{n.message}</p>}
        {n.type === "low_stock" && n.reference_id && (
          <button type="button" onClick={onOpen} className="mt-1.5 text-[0.875rem] font-semibold text-ink underline">
            View product
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(n.id)}
        aria-label="Dismiss"
        className="press grid size-8 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-ground-2 hover:text-ink"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
