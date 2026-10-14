"use server";

import { CHAT_PHOTO_PATH, CHAT_PHOTOS_MIGRATION, MESSAGE_MAX } from "./data";
import { requireCustomer } from "@/features/customer/shell/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ChatResult = { ok: true } | { ok: false; message: string };

/** The customer writes to the shop (every owner reads it), optionally about one of their orders, with an optional photo. */
export async function sendChatMessage(text: string, orderId: string | null, photoPath: string | null): Promise<ChatResult> {
  const { supabase, profile } = await requireCustomer();
  const message = typeof text === "string" ? text.trim() : "";
  const photo = typeof photoPath === "string" && photoPath ? photoPath : null;
  if (!message && !photo) return { ok: false, message: "Write a message or add a photo first." };
  if (message.length > MESSAGE_MAX) return { ok: false, message: `Keep it under ${MESSAGE_MAX.toLocaleString("en-PH")} characters.` };
  if (photo && (!CHAT_PHOTO_PATH.test(photo) || !photo.startsWith(`${profile.id}/`))) return { ok: false, message: "That photo didn’t upload. Try adding it again." };
  if (orderId !== null && (typeof orderId !== "string" || !UUID.test(orderId))) return { ok: false, message: "That order doesn’t exist anymore. Send it without the order." };

  const row: Record<string, unknown> = { message, order_id: orderId };
  if (photo) row.image_path = photo;
  const { error } = await supabase.from("chat_messages").insert(row);
  if (error) {
    if (photo && (error.code === "42703" || error.code === "PGRST204")) return { ok: false, message: `Photos need the shop’s latest database update (${CHAT_PHOTOS_MIGRATION}).` };
    if (error.code === "42501") return { ok: false, message: "That order isn’t yours. Send it without the order." };
    if (error.code === "23514") return { ok: false, message: message ? `Keep it under ${MESSAGE_MAX.toLocaleString("en-PH")} characters.` : "Write a message first." };
    return { ok: false, message: "We couldn’t send that. Check your connection and try again." };
  }
  return { ok: true };
}

/** Opening the chat reads the shop's messages, and clears the customer's chat alerts. */
export async function markChatRead(): Promise<ChatResult> {
  const { supabase, profile } = await requireCustomer();
  const [msgs, alerts] = await Promise.all([
    supabase.from("chat_messages").update({ is_read: true }).eq("receiver_id", profile.id).eq("is_read", false),
    supabase.from("notifications").update({ is_read: true }).eq("user_id", profile.id).eq("type", "chat").eq("is_read", false),
  ]);
  return msgs.error || alerts.error ? { ok: false, message: "" } : { ok: true };
}
