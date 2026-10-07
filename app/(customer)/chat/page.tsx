import type { Metadata } from "next";
import { ChatView } from "@/components/customer/tab-views";
import { requireCustomer } from "@/lib/customer/session";

export const metadata: Metadata = { title: "Chat · J&J Sportswear" };

export default async function ChatPage() {
  await requireCustomer();
  return <ChatView />;
}
