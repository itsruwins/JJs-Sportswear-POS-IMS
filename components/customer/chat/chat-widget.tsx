"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ImagePlus, LoaderCircle, MessageCircle, SendHorizontal, X } from "lucide-react";
import { clock, dayLabel, sameDay } from "@/components/admin/chat/chat-bits";
import { prepareForUpload } from "@/components/admin/products/photo-picker";
import { markChatRead, sendChatMessage } from "@/app/(customer)/chat/actions";
import {
  fetchChatOrders,
  fetchChatUnread,
  fetchMyChat,
  MESSAGE_MAX,
  onOpenChat,
  orderQuestion,
  QUICK_REPLIES,
  type ChatOrder,
  type MyChatMessage,
} from "@/lib/customer/chat";
import { STATUS_TEXT } from "@/lib/customer/orders";
import { createClient } from "@/lib/supabase/client";

type Tag = { id: string; number: string };
type Photo = { blob: Blob; ext: string; type: string; url: string };
type Chat = { messages: MyChatMessage[]; photos: boolean; error: boolean };

const finePointer = () => window.matchMedia("(pointer: fine)").matches;
const phone = () => window.matchMedia("(max-width: 639px)").matches;

/**
 * The customer's chat with the shop, in a bubble that floats over every customer page.
 * It opens like a chatbot (a greeting and quick replies) but a person from the shop
 * always answers, from the admin inbox. Messages arrive live; opening it reads them.
 */
export function ChatWidget({ uid, firstName, initialUnread, hours }: { uid: string; firstName: string; initialUnread: number; hours: string | null }) {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const ids = { panel: useId(), title: useId(), text: useId(), error: useId() };
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [chat, setChat] = useState<Chat | null>(null);
  const [orders, setOrders] = useState<ChatOrder[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [tag, setTag] = useState<Tag | null>(null);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [pending, setPending] = useState<MyChatMessage | null>(null);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState(false);

  const openRef = useRef(open);
  const fab = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const sending = useRef(false);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // On phones the panel is a full-screen sheet, so it's modal there (and only there).
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setSheet(mq.matches);
    mq.addEventListener("change", sync);
    const t = window.setTimeout(sync, 0);
    return () => {
      mq.removeEventListener("change", sync);
      window.clearTimeout(t);
    };
  }, []);

  const load = useCallback(async () => {
    const next = await fetchMyChat(supabase, uid);
    setChat(next);
  }, [supabase, uid]);

  // Live: a new message recounts the bubble and, while open, reloads the conversation.
  // Falls back to a check on tab focus and every minute.
  useEffect(() => {
    let timer: number | undefined;
    const changed = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        fetchChatUnread(supabase, uid).then((n) => n !== null && setUnread(n));
        if (openRef.current) load();
      }, 300);
    };
    const channel = supabase
      .channel(`my-chat-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, changed)
      .subscribe();
    const onVisible = () => document.visibilityState === "visible" && changed();
    const poll = window.setInterval(onVisible, 60_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [supabase, uid, load]);

  // Opening loads the conversation (and the orders for "Ask about my order").
  const show = useCallback(() => {
    setOpen(true);
    load();
    fetchChatOrders(supabase).then(setOrders);
  }, [load, supabase]);

  // Open and looked at: the shop's messages are read.
  useEffect(() => {
    if (!open || unread === 0) return;
    const read = () => {
      if (document.visibilityState !== "visible") return;
      markChatRead().then((r) => r.ok && setUnread(0));
    };
    read();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, [open, unread]);

  // From an order or product page: open, tagged with the order or started with the product.
  useEffect(
    () =>
      onOpenChat((d) => {
        show();
        setPicking(false);
        if (d.order) setTag(d.order);
        if (d.draft) setText((t) => (t.trim() ? t : d.draft!));
        requestAnimationFrame(() => area.current?.focus());
      }),
    [show],
  );

  // /chat (and later, notifications) land on a page with ?chat=open.
  useEffect(() => {
    if (new URL(window.location.href).searchParams.get("chat") !== "open") return;
    // The flag comes off only when the panel opens (React may run this twice in development).
    const t = window.setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.delete("chat");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      show();
    }, 0);
    return () => window.clearTimeout(t);
  }, [pathname, show]);

  // Focus moves into the panel on open and back to the bubble on close. On phones the
  // panel covers the page, so the page behind it stops scrolling.
  useEffect(() => {
    const root = document.documentElement;
    // Phones: the sheet covers the page, so the page (header, content, dock) is out of reach until it closes.
    const behind = open && phone() ? [...document.querySelectorAll<HTMLElement>("header.site-nav, #main, nav.customer-dock, a[href='#main']")] : [];
    behind.forEach((el) => (el.inert = true));
    if (open) {
      if (behind.length) root.classList.add("chat-open");
      requestAnimationFrame(() => (finePointer() ? area.current : heading.current)?.focus());
    } else if (wasOpen.current) {
      fab.current?.focus();
    }
    wasOpen.current = open;
    return () => {
      root.classList.remove("chat-open");
      behind.forEach((el) => (el.inert = false));
    };
  }, [open]);

  // The newest message stays in view.
  const count = chat?.messages.length ?? 0;
  useLayoutEffect(() => {
    const el = list.current;
    if (el && open) el.scrollTop = el.scrollHeight;
  }, [open, count, pending, picking, chat]);

  // The reply box grows with the text, up to about five lines.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [text, open]);

  const send = async (body: string, order: Tag | null, withPhoto: Photo | null) => {
    const t = body.trim();
    // A ref, not state: an Enter and a click in the same moment both see it.
    if ((!t && !withPhoto) || sending.current) return false;
    if (t.length > MESSAGE_MAX) {
      setError(`Keep it under ${MESSAGE_MAX.toLocaleString("en-PH")} characters.`);
      return false;
    }
    sending.current = true;
    setError("");
    setPending({ id: "pending", text: t, createdAt: new Date().toISOString(), isRead: false, mine: true, photoPath: null, photoUrl: withPhoto?.url ?? null, order });
    let path: string | null = null;
    try {
      if (withPhoto) {
        path = `${uid}/${crypto.randomUUID()}.${withPhoto.ext}`;
        const up = await supabase.storage.from("chat-photos").upload(path, withPhoto.blob, { contentType: withPhoto.type });
        if (up.error) {
          path = null;
          throw new Error("The photo didn’t upload. Check your connection and try again.");
        }
      }
      const r = await sendChatMessage(t, order?.id ?? null, path);
      if (!r.ok) throw new Error(r.message);
      await load();
      return true;
    } catch (e) {
      if (path) await supabase.storage.from("chat-photos").remove([path]);
      setError(e instanceof Error && e.message ? e.message : "We couldn’t send that. Check your connection and try again.");
      return false;
    } finally {
      sending.current = false;
      setPending(null);
    }
  };

  const submit = async () => {
    const snapshot = { text, tag, photo };
    // One message at a time: while one is sending, Enter leaves the next one in the box.
    if ((!text.trim() && !photo) || sending.current) return;
    // Clear the box at once, like any chat; put it back if sending fails.
    setText("");
    setTag(null);
    setPhoto(null);
    const ok = await send(snapshot.text, snapshot.tag, snapshot.photo);
    if (ok) {
      if (snapshot.photo) URL.revokeObjectURL(snapshot.photo.url);
    } else {
      setText((t) => t || snapshot.text);
      setTag((x) => x ?? snapshot.tag);
      setPhoto((p) => p ?? snapshot.photo);
    }
    area.current?.focus();
  };

  const quickReply = (id: (typeof QUICK_REPLIES)[number]["id"]) => {
    const q = QUICK_REPLIES.find((x) => x.id === id)!;
    if ("text" in q) return send(q.text, null, null);
    if (orders?.length) return setPicking(true);
    return send("Hi! I have a question about an order.", null, null);
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPreparing(true);
    setError("");
    try {
      const { blob, ext, type } = await prepareForUpload(file);
      setPhoto((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return { blob, ext, type, url: URL.createObjectURL(blob) };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn’t use that photo. Try another one.");
    } finally {
      setPreparing(false);
      area.current?.focus();
    }
  };

  const messages = chat?.messages ?? [];
  const shown = pending ? [...messages, pending] : messages;
  const last = shown.at(-1);
  const lastMine = [...shown].reverse().find((m) => m.mine);
  const fresh = chat !== null && messages.length === 0 && !pending;
  const waitingNote = hours ? `The shop replies here during store hours (${hours}).` : "The shop usually replies here the same day.";
  const now = new Date();
  // Every open order, the ones most likely to need a word first (ready, then in the works, then waiting); else the latest few.
  const RANK: Partial<Record<ChatOrder["status"], number>> = { ready: 0, in_progress: 1, accepted: 2, pending: 3 };
  const openOrders = (orders ?? []).filter((o) => o.status in RANK).sort((a, b) => RANK[a.status]! - RANK[b.status]!);
  const orderChoices = openOrders.length ? openOrders : (orders ?? []).slice(0, 3);

  return (
    <>
      <button
        ref={fab}
        type="button"
        onClick={() => (open ? setOpen(false) : show())}
        aria-expanded={open}
        aria-controls={ids.panel}
        className="chat-fab board press"
      >
        {open ? <X aria-hidden="true" className="size-6" /> : <MessageCircle aria-hidden="true" className="size-6" strokeWidth={1.9} />}
        <span className="sr-only">
          {open ? "Close chat" : "Chat with the shop"}
          {unread > 0 && !open ? `, ${unread} new ${unread === 1 ? "message" : "messages"}` : ""}
        </span>
        {unread > 0 && !open && (
          <span aria-hidden="true" className="chat-fab-badge tabular">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <section
        id={ids.panel}
        role="dialog"
        aria-modal={sheet || undefined}
        aria-labelledby={ids.title}
        data-open={open || undefined}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        className="chat-panel"
      >
        <header className="chat-panel-head board">
          {/* The wordmark's two hinged J cards, small, on the board. */}
          <span aria-hidden="true" className="voice-board inline-flex shrink-0 items-center gap-[2px] text-[1.0625rem] leading-none">
            <span className="relative inline-grid h-[1.3rem] w-[0.95rem] place-items-center rounded-[3px] bg-card text-card-ink">
              J<span className="absolute inset-x-0 top-1/2 h-px bg-black/25" />
            </span>
            <span className="text-board-ink">&amp;</span>
            <span className="relative inline-grid h-[1.3rem] w-[0.95rem] place-items-center rounded-[3px] bg-card text-card-ink">
              J<span className="absolute inset-x-0 top-1/2 h-px bg-black/25" />
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={ids.title} ref={heading} tabIndex={-1} className="truncate text-[1rem] font-semibold text-board-ink outline-none">
              J&amp;J Sportswear
            </h2>
            <p className="truncate text-[0.8125rem] text-board-ink/75">A person from the shop answers</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="press grid size-10 shrink-0 place-items-center rounded-full text-board-ink hover:bg-board-deep sm:hidden"
          >
            <X aria-hidden="true" className="size-5" />
            <span className="sr-only">Close chat</span>
          </button>
        </header>

        <div ref={list} className="chat-panel-body" aria-live="polite" aria-relevant="additions">
          {/* The greeting: from the shop, not stored, always first. */}
          <div className="flex flex-col items-start">
            <p className="chat-bubble chat-bubble-shop">
              Hi {firstName}! You’re chatting with J&amp;J Sportswear. Ask about sizes, prices, or your orders, and a person from the shop will
              answer {hours ? `during store hours (${hours})` : "here, usually the same day"}.
            </p>
          </div>

          {fresh && !picking && (
            <div className="mt-3 flex flex-col items-start gap-2" role="group" aria-label="Quick replies">
              {QUICK_REPLIES.map((q) => (
                <button key={q.id} type="button" onClick={() => quickReply(q.id)} className="shop-chip press h-10 px-4 text-[0.9375rem]">
                  {q.label}
                </button>
              ))}
            </div>
          )}

          {picking && (
            <div className="mt-3 flex flex-col items-start gap-2">
              <p className="chat-bubble chat-bubble-shop">Which order is it about?</p>
              <div className="flex flex-col items-start gap-2" role="group" aria-label="Your orders">
                {orderChoices.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => {
                      setPicking(false);
                      send(orderQuestion(o.number), { id: o.id, number: o.number }, null);
                    }}
                    className="shop-chip press h-10 px-4 text-[0.9375rem]"
                  >
                    <span className="tabular">{o.number}</span>
                    <span className="ml-1.5 font-normal text-ink-2">{STATUS_TEXT[o.status]}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setPicking(false);
                    send("Hi! I have a question about an order.", null, null);
                  }}
                  className="shop-chip press h-10 px-4 text-[0.9375rem]"
                >
                  Another order
                </button>
                <button type="button" onClick={() => setPicking(false)} className="press h-10 rounded-full px-4 text-[0.9375rem] font-semibold text-ink-2 hover:text-ink">
                  Never mind
                </button>
              </div>
            </div>
          )}

          {chat === null && open && (
            <p className="mt-6 flex items-center justify-center gap-2 text-[0.875rem] text-ink-2" role="status">
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              Loading your messages…
            </p>
          )}
          {chat?.error && (
            <p role="alert" className="auth-alert mt-4 rounded-xl px-3.5 py-2.5 text-[0.875rem]">
              We couldn’t load your messages just now. Close the chat and open it again.
            </p>
          )}

          {shown.length > 0 && (
            <ol aria-label="Messages" className="mt-1 flex flex-col">
              {shown.map((m, i) => {
                const prev = shown[i - 1];
                const newDay = !prev || !sameDay(prev.createdAt, m.createdAt);
                const sideChanged = !prev || prev.mine !== m.mine;
                const orderChanged = m.order && (!prev || prev.order?.id !== m.order.id || newDay);
                const next = shown[i + 1];
                const endOfRun = !next || next.mine !== m.mine || !sameDay(m.createdAt, next.createdAt);
                const isPending = m.id === "pending";
                return (
                  <li key={m.id} className={`flex flex-col ${m.mine ? "items-end" : "items-start"} ${newDay ? "" : sideChanged ? "mt-3" : "mt-1"}`}>
                    {newDay && <p className="voice-label my-3 self-center text-[0.6875rem] text-ink-2">{dayLabel(m.createdAt, now)}</p>}
                    {orderChanged && m.order && (
                      <Link href={`/orders/${m.order.id}`} className="tabular mb-1 px-1 text-[0.75rem] font-semibold text-ink-2 hover:text-ink hover:underline">
                        About {m.order.number}
                      </Link>
                    )}
                    <span className="sr-only">{m.mine ? "You" : "J&J Sportswear"}: </span>
                    {m.photoUrl && (
                      <a href={m.photoUrl} target="_blank" rel="noreferrer" className={`chat-photo press ${isPending ? "opacity-70" : ""}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={m.photoUrl} alt={m.mine ? "Your photo" : "Photo from the shop"} />
                      </a>
                    )}
                    {m.photoPath && !m.photoUrl && <p className="chat-bubble chat-bubble-shop text-ink-2">Photo unavailable</p>}
                    {m.text && <p className={`chat-bubble ${m.mine ? "chat-bubble-mine" : "chat-bubble-shop"} ${m.photoUrl ? "mt-1" : ""}`}>{m.text}</p>}
                    {(endOfRun || (m === lastMine && m.isRead)) && (
                      <p className="tabular mt-1 px-1 text-[0.75rem] text-ink-2">
                        {isPending ? "Sending…" : clock(m.createdAt)}
                        {m.mine && m === lastMine && m.isRead && !isPending && " · Seen"}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {last?.mine && !last.isRead && last.id !== "pending" && <p className="mt-3 text-center text-[0.8125rem] text-ink-2">{waitingNote}</p>}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="chat-panel-foot"
        >
          {error && (
            <p id={ids.error} role="alert" className="auth-alert mb-2 rounded-xl px-3.5 py-2.5 text-[0.875rem]">
              {error}
            </p>
          )}
          {(tag || photo) && (
            <div className="mb-2 flex flex-wrap items-end gap-2">
              {photo && (
                <span className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt="Photo to send" className="size-16 rounded-xl object-cover shadow-[inset_0_0_0_1px_var(--line)]" />
                  <button
                    type="button"
                    onClick={() => {
                      URL.revokeObjectURL(photo.url);
                      setPhoto(null);
                    }}
                    className="press absolute -right-2 -top-2 grid size-7 place-items-center rounded-full bg-ink text-ground"
                  >
                    <X aria-hidden="true" className="size-3.5" />
                    <span className="sr-only">Remove photo</span>
                  </button>
                </span>
              )}
              {tag && (
                <span className="inline-flex h-8 items-center gap-1 rounded-full bg-ground-2 pl-3 pr-1 text-[0.8125rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)]">
                  About <span className="tabular">{tag.number}</span>
                  <button type="button" onClick={() => setTag(null)} className="press grid size-6 place-items-center rounded-full text-ink-2 hover:bg-ground hover:text-ink">
                    <X aria-hidden="true" className="size-3.5" />
                    <span className="sr-only">Not about {tag.number}</span>
                  </button>
                </span>
              )}
            </div>
          )}
          <div className="chat-input">
            {chat?.photos !== false && (
              <label className="press grid size-10 shrink-0 cursor-pointer place-items-center self-end rounded-full text-ink-2 hover:bg-ground-2 hover:text-ink focus-within:text-ink">
                {preparing ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : <ImagePlus aria-hidden="true" className="size-5" />}
                <span className="sr-only">Add a photo</span>
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={preparing}
                  onChange={(e) => {
                    pickPhoto(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
            <label htmlFor={ids.text} className="sr-only">
              Message to the shop
            </label>
            <textarea
              id={ids.text}
              ref={area}
              rows={1}
              value={text}
              maxLength={MESSAGE_MAX + 200}
              onChange={(e) => {
                setText(e.target.value);
                if (error) setError("");
              }}
              onKeyDown={(e) => {
                // With a keyboard, Enter sends and Shift + Enter starts a new line. On phones, Enter is a new line.
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && finePointer()) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Type a message…"
              aria-describedby={error ? ids.error : undefined}
              className="min-w-0 flex-1 resize-none self-center bg-transparent py-2 text-[1rem] leading-normal text-ink outline-none placeholder:text-ink-2"
            />
            <button
              type="submit"
              disabled={(!text.trim() && !photo) || !!pending}
              className="press grid size-10 shrink-0 place-items-center self-end rounded-full bg-board text-board-ink hover:bg-board-deep disabled:bg-ground-2 disabled:text-ink-2"
            >
              {pending ? <LoaderCircle aria-hidden="true" className="size-[1.125rem] animate-spin" /> : <SendHorizontal aria-hidden="true" className="size-[1.125rem]" />}
              <span className="sr-only">Send</span>
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
