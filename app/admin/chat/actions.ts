"use server";

import { CHAT_MIGRATION, MESSAGE_MAX } from "@/lib/admin/chat";
import { requireStaff } from "@/lib/admin/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validId = (id: unknown): id is string => typeof id === "string" && UUID.test(id);

export type ChatResult = { ok: true } | { ok: false; message: string };

/** The owner replies to a customer, optionally about one of their orders. */
export async function sendMessage(customerId: string, text: string, orderId: string | null): Promise<ChatResult> {
  const { supabase, profile } = await requireStaff();
  if (profile.role !== "owner") return { ok: false, message: "Only the owner can message customers." };
  if (!validId(customerId) || (orderId !== null && !validId(orderId))) return { ok: false, message: "That conversation doesn’t exist anymore." };
  const message = typeof text === "string" ? text.trim() : "";
  if (!message) return { ok: false, message: "Write a message first." };
  if (message.length > MESSAGE_MAX) return { ok: false, message: `Keep it under ${MESSAGE_MAX.toLocaleString("en-PH")} characters.` };

  if (orderId) {
    // Only tag one of this customer's own orders.
    const { data } = await supabase.from("custom_orders").select("id").eq("id", orderId).eq("customer_id", customerId).maybeSingle();
    if (!data) return { ok: false, message: "That order isn’t this customer’s. Pick another, or send it without one." };
  }

  const { error } = await supabase.from("chat_messages").insert({ receiver_id: customerId, order_id: orderId, message });
  if (error) {
    if (error.code === "42501") return { ok: false, message: `Sending needs the latest database update (${CHAT_MIGRATION}), or your account can’t message customers.` };
    if (error.code === "23514") return { ok: false, message: `Keep it under ${MESSAGE_MAX.toLocaleString("en-PH")} characters.` };
    return { ok: false, message: "We couldn’t send that. Check your connection and try again." };
  }
  return { ok: true };
}

/** Opening a conversation reads it: the customer's messages, and this owner's alerts about them. */
export async function markThreadRead(customerId: string): Promise<ChatResult> {
  const { supabase, profile } = await requireStaff();
  if (profile.role !== "owner" || !validId(customerId)) return { ok: false, message: "" };
  const [msgs, alerts] = await Promise.all([
    supabase
      .from("chat_messages")
      .update({ is_read: true })
      .eq("sender_id", customerId)
      .eq("is_read", false)
      .or(`receiver_id.is.null,receiver_id.eq.${profile.id}`),
    supabase.from("notifications").update({ is_read: true }).eq("type", "chat").eq("reference_id", customerId).eq("is_read", false),
  ]);
  return msgs.error || alerts.error ? { ok: false, message: "" } : { ok: true };
}
