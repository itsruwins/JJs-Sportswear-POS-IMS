// The customer's chat with the shop: one conversation, read in the chat widget that floats
// over every customer page. A person from the shop always answers (the owner, from the
// admin inbox); the widget only borrows a chatbot's shape: a greeting and quick replies.
// Safe for client components.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderStatus } from "@/features/customer/orders/model";

export const CHAT_PHOTOS_MIGRATION = "supabase/migrations/20261015000000_chat_photos.sql";
export const MESSAGE_MAX = 2000;
const THREAD_LIMIT = 150;
/** Photo links last a working day, so an open widget keeps showing them. */
const PHOTO_LINK_FOR = 6 * 60 * 60;

/** A photo in chat: `<sender id>/<uuid>.<jpg|png|webp>` in the private chat-photos bucket. */
export const CHAT_PHOTO_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

export type MyChatMessage = {
  id: string;
  text: string;
  createdAt: string;
  /** For the customer's own messages: the shop has read it. */
  isRead: boolean;
  mine: boolean;
  photoPath: string | null;
  photoUrl: string | null;
  order: { id: string; number: string } | null;
};

export type ChatOrder = { id: string; number: string; status: OrderStatus };

type Row = {
  id: string;
  sender_id: string;
  message: string;
  created_at: string;
  is_read: boolean;
  image_path?: string | null;
  order: { id: string; order_number: string } | null;
};

const missingColumn = (e: { code?: string } | null) => e?.code === "42703" || e?.code === "PGRST204";

/**
 * The conversation, oldest first (the latest 150 messages). `photos` is false until the
 * chat photos migration has run, so the widget can hide the photo button.
 */
export async function fetchMyChat(supabase: SupabaseClient, uid: string) {
  const run = (withPhotos: boolean) =>
    supabase
      .from("chat_messages")
      .select(`id, sender_id, message, created_at, is_read${withPhotos ? ", image_path" : ""}, order:custom_orders (id, order_number)`)
      .or(`sender_id.eq.${uid},receiver_id.eq.${uid}`)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(THREAD_LIMIT);
  let res = await run(true);
  const photos = !missingColumn(res.error);
  if (!photos) res = await run(false);
  if (res.error) return { messages: [] as MyChatMessage[], photos, error: true };

  const rows = ((res.data ?? []) as unknown as Row[]).reverse();
  const paths = rows.map((r) => r.image_path).filter((p): p is string => Boolean(p));
  const signed = paths.length ? await supabase.storage.from("chat-photos").createSignedUrls(paths, PHOTO_LINK_FOR) : null;
  const urlFor = new Map((signed?.data ?? []).map((s) => [s.path, s.signedUrl]));

  const messages: MyChatMessage[] = rows.map((r) => ({
    id: r.id,
    text: r.message,
    createdAt: r.created_at,
    isRead: r.is_read,
    mine: r.sender_id === uid,
    photoPath: r.image_path ?? null,
    photoUrl: r.image_path ? (urlFor.get(r.image_path) ?? null) : null,
    order: r.order ? { id: r.order.id, number: r.order.order_number } : null,
  }));
  return { messages, photos, error: false };
}

/** Messages from the shop the customer hasn't opened: the count on the chat bubble. */
export async function fetchChatUnread(supabase: SupabaseClient, uid: string) {
  const { count, error } = await supabase
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("receiver_id", uid)
    .eq("is_read", false);
  return error ? null : (count ?? 0);
}

/** The customer's orders, newest first, for "Ask about my order". */
export async function fetchChatOrders(supabase: SupabaseClient) {
  const { data } = await supabase.from("custom_orders").select("id, order_number, status").order("created_at", { ascending: false }).limit(20);
  return ((data ?? []) as { id: string; order_number: string; status: OrderStatus }[]).map((o) => ({ id: o.id, number: o.order_number, status: o.status }));
}

/** Quick replies under the greeting. Each one sends a real message to the shop. */
export const QUICK_REPLIES = [
  { id: "order", label: "Ask about my order" },
  { id: "sizes", label: "Sizes and prices", text: "Hi! I’d like to ask about sizes and prices." },
  { id: "custom", label: "Custom order help", text: "Hi! I need help with a custom order." },
] as const;

export const orderQuestion = (number: string) => `Hi! I have a question about my order ${number}.`;

// Opening the widget from anywhere on the page: an order page tags the next message,
// a product page starts the message with the product's name.
export type OpenChatDetail = { order?: { id: string; number: string }; draft?: string };
const OPEN_EVENT = "jj:open-chat";

export function openChat(detail: OpenChatDetail = {}) {
  window.dispatchEvent(new CustomEvent<OpenChatDetail>(OPEN_EVENT, { detail }));
}

export function onOpenChat(handler: (detail: OpenChatDetail) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<OpenChatDetail>).detail ?? {});
  window.addEventListener(OPEN_EVENT, listener);
  return () => window.removeEventListener(OPEN_EVENT, listener);
}
