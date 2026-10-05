"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, SendHorizontal } from "lucide-react";
import { markThreadRead, sendMessage } from "@/app/admin/chat/actions";
import { MESSAGE_MAX, type CustomerOrder } from "@/lib/admin/chat";
import { STATUS_LABEL } from "@/lib/admin/orders";

/** Opening a conversation reads it; runs again when a new message lands while it's open. */
export function MarkRead({ customerId, unread, latest }: { customerId: string; unread: number; latest: string }) {
  const router = useRouter();
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (unread === 0) return;
    const read = () => {
      if (done.current === latest || document.visibilityState !== "visible") return;
      done.current = latest;
      markThreadRead(customerId)
        .then((r) => {
          if (r.ok) router.refresh();
          else done.current = null; // try again on the next look
        })
        .catch(() => {
          done.current = null;
        });
    };
    read();
    // Opened in a background tab, or a message arrived while away: read it once it's looked at.
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, [customerId, unread, latest, router]);
  return null;
}

/**
 * Keeps the newest message in view: on open, after you send, and as messages arrive while
 * you're at the bottom. Reading further up, a new message doesn't pull you away.
 */
export function ScrollToEnd({ latest, mine }: { latest: string; mine: boolean }) {
  const first = useRef(true);
  const atBottom = useRef(true);
  useEffect(() => {
    const track = () => {
      atBottom.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 240;
    };
    window.addEventListener("scroll", track, { passive: true });
    return () => window.removeEventListener("scroll", track);
  }, []);
  useLayoutEffect(() => {
    if (!first.current && !mine && !atBottom.current) return;
    // The very bottom of the page, where the reply box rests above the dock and covers nothing.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: first.current || reduce ? "instant" : "smooth" });
    first.current = false;
    atBottom.current = true;
  }, [latest, mine]);
  return null;
}

/** The owner's reply box: sticks above the dock, grows with the message, and can tag one of the customer's orders. */
export function Composer({
  customerId,
  firstName,
  orders,
  preselectOrder,
}: {
  customerId: string;
  firstName: string;
  orders: CustomerOrder[];
  preselectOrder: string | null;
}) {
  const router = useRouter();
  const ids = { text: useId(), order: useId(), error: useId(), hint: useId(), count: useId() };
  const area = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [orderId, setOrderId] = useState(orders.some((o) => o.id === preselectOrder) ? preselectOrder! : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const trimmed = text.trim();
  const over = text.length > MESSAGE_MAX;

  // Grow with the text, up to about eight lines.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  const send = async () => {
    if (!trimmed || over || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await sendMessage(customerId, trimmed, orderId || null);
      if (r.ok) {
        setText("");
        router.refresh();
        area.current?.focus();
      } else setError(r.message);
    } catch {
      setError("We couldn’t reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      className="chat-composer rounded-2xl p-2.5"
    >
      {error && (
        <p id={ids.error} role="alert" className="auth-alert mb-2 rounded-xl px-3.5 py-2.5 text-[0.875rem]">
          {error}
        </p>
      )}
      <label htmlFor={ids.text} className="sr-only">
        Message to {firstName}
      </label>
      <span id={ids.hint} className="sr-only">
        Ctrl or Command plus Enter sends.
      </span>
      <textarea
        id={ids.text}
        ref={area}
        rows={1}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (error) setError("");
        }}
        onKeyDown={(e) => {
          // Enter writes a new line; Ctrl or ⌘ + Enter sends.
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            send();
          }
        }}
        placeholder={`Message ${firstName}…`}
        aria-invalid={over || undefined}
        aria-keyshortcuts="Control+Enter Meta+Enter"
        aria-describedby={[ids.hint, error ? ids.error : "", text.length > MESSAGE_MAX - 200 ? ids.count : ""].filter(Boolean).join(" ")}
        className="block max-h-[13.75rem] w-full resize-none bg-transparent px-2.5 py-2 text-[1rem] leading-relaxed text-ink outline-none placeholder:text-ink-2"
      />
      <div className="mt-1.5 flex items-center justify-between gap-2">
        {orders.length > 0 ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <label htmlFor={ids.order} className="sr-only shrink-0 text-[0.8125rem] font-semibold text-ink-2 sm:not-sr-only">
              About
            </label>
            <select
              id={ids.order}
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              className="h-10 w-full min-w-0 truncate rounded-lg bg-ground-2 px-2.5 text-[0.8125rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] sm:w-auto sm:max-w-[22rem]"
            >
              <option value="">Not about an order</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.order_number} · {STATUS_LABEL[o.status]}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <span />
        )}
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {text.length > MESSAGE_MAX - 200 && (
            <span id={ids.count} className={`tabular text-[0.75rem] ${over ? "font-semibold text-ink" : "text-ink-2"}`}>
              {text.length.toLocaleString("en-PH")}/{MESSAGE_MAX.toLocaleString("en-PH")}
            </span>
          )}
          <button
            type="submit"
            disabled={!trimmed || over}
            aria-disabled={busy || undefined}
            className="press inline-flex h-10 items-center gap-2 rounded-xl bg-board px-4 text-[0.9375rem] font-semibold text-board-ink hover:bg-board-deep disabled:opacity-45"
          >
            {busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <SendHorizontal aria-hidden="true" className="size-4" />}
            Send
          </button>
        </div>
      </div>
    </form>
  );
}
