import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderStatus } from "./orders";

export const CHAT_MIGRATION = "supabase/migrations/20261011000000_owner_chat.sql";
export const MESSAGE_MAX = 2000;
const THREAD_LIMIT = 200;

export type InboxRow = {
  customer_id: string;
  username: string;
  full_name: string | null;
  last_message: string;
  last_at: string;
  last_from_customer: boolean;
  last_sender_id: string;
  last_order_number: string | null;
  unread: number;
};

export type ChatMessage = {
  id: string;
  message: string;
  created_at: string;
  is_read: boolean;
  fromCustomer: boolean;
  /** Null when the customer wrote to the shop. */
  receiverId: string | null;
  sender: { id: string; username: string; full_name: string | null } | null;
  order: { id: string; order_number: string } | null;
};

export type ChatCustomer = {
  id: string;
  username: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
};

export type CustomerOrder = { id: string; order_number: string; status: OrderStatus };

/** The owner's conversations, newest first. `migrated` is false until the chat migration has run. */
export async function fetchInbox(supabase: SupabaseClient): Promise<{ rows: InboxRow[]; migrated: boolean; error: boolean }> {
  const { data, error } = await supabase.rpc("chat_inbox");
  if (error?.code === "PGRST202") return { rows: [], migrated: false, error: false };
  if (error) return { rows: [], migrated: true, error: true };
  return { rows: (data ?? []) as InboxRow[], migrated: true, error: false };
}

/**
 * Customer messages this owner hasn't read (to the shop, or to them): the badge on Chat.
 * The same rule as the inbox's unread counts, so opening each conversation clears it.
 */
export async function fetchUnreadChats(supabase: SupabaseClient, ownerId: string) {
  const { count, error } = await supabase
    .from("chat_messages")
    .select("id, sender:profiles!chat_messages_sender_id_fkey!inner (role)", { count: "exact", head: true })
    .eq("is_read", false)
    .eq("sender.role", "customer")
    .or(`receiver_id.is.null,receiver_id.eq.${ownerId}`);
  return error ? null : (count ?? 0);
}

/** A customer message counts as unread for this owner when it's to the shop or to them. */
export const unreadFor = (m: Pick<ChatMessage, "fromCustomer" | "is_read" | "receiverId">, ownerId: string) =>
  m.fromCustomer && !m.is_read && (m.receiverId === null || m.receiverId === ownerId);

type Lookup =
  | { kind: "customer"; customer: ChatCustomer }
  | { kind: "order"; customerId: string }
  | { kind: "missing" }
  | { kind: "error" };

/** Who a /admin/chat/[id] link means: a customer, or (from an older alert) one of their orders. */
export async function findCustomer(supabase: SupabaseClient, id: string): Promise<Lookup> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, full_name, phone, email, role, created_at")
    .eq("id", id)
    .maybeSingle<ChatCustomer & { role: string }>();
  if (error) return { kind: "error" };
  if (data) {
    if (data.role !== "customer") return { kind: "missing" };
    const { id: cid, username, full_name, phone, email, created_at } = data;
    return { kind: "customer", customer: { id: cid, username, full_name, phone, email, created_at } };
  }
  const { data: order } = await supabase.from("custom_orders").select("customer_id").eq("id", id).maybeSingle<{ customer_id: string }>();
  return order ? { kind: "order", customerId: order.customer_id } : { kind: "missing" };
}

type MessageRow = {
  id: string;
  sender_id: string;
  receiver_id: string | null;
  message: string;
  created_at: string;
  is_read: boolean;
  sender: ChatMessage["sender"];
  order: ChatMessage["order"];
};

/** One customer's conversation, oldest first (the latest 200 messages), plus their orders for the composer. */
export async function fetchThread(supabase: SupabaseClient, customerId: string) {
  const [msgs, orders] = await Promise.all([
    supabase
      .from("chat_messages")
      .select(
        "id, sender_id, receiver_id, message, created_at, is_read, sender:profiles!chat_messages_sender_id_fkey (id, username, full_name), order:custom_orders (id, order_number)",
      )
      .or(`sender_id.eq.${customerId},receiver_id.eq.${customerId}`)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(THREAD_LIMIT + 1),
    supabase
      .from("custom_orders")
      .select("id, order_number, status")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const rows = (msgs.data ?? []) as unknown as MessageRow[];
  const messages: ChatMessage[] = rows
    .slice(0, THREAD_LIMIT)
    .reverse()
    .map((r) => ({
      id: r.id,
      message: r.message,
      created_at: r.created_at,
      is_read: r.is_read,
      fromCustomer: r.sender_id === customerId,
      receiverId: r.receiver_id,
      sender: r.sender,
      order: r.order,
    }));
  return {
    messages,
    more: rows.length > THREAD_LIMIT,
    orders: (orders.data ?? []) as CustomerOrder[],
    error: !!msgs.error,
  };
}

/** The latest messages about one order, for its page. */
export async function fetchOrderMessages(supabase: SupabaseClient, orderId: string, customerId: string, limit = 4) {
  const { data, count, error } = await supabase
    .from("chat_messages")
    .select("id, sender_id, receiver_id, message, created_at, is_read, sender:profiles!chat_messages_sender_id_fkey (id, username, full_name), order:custom_orders (id, order_number)", {
      count: "exact",
    })
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  const messages: ChatMessage[] = ((data ?? []) as unknown as MessageRow[]).reverse().map((r) => ({
    id: r.id,
    message: r.message,
    created_at: r.created_at,
    is_read: r.is_read,
    fromCustomer: r.sender_id === customerId,
    receiverId: r.receiver_id,
    sender: r.sender,
    order: r.order,
  }));
  return { messages, total: count ?? messages.length, error: !!error };
}
