"use client";

import { MessageCircle } from "lucide-react";
import { openChat, type OpenChatDetail } from "@/lib/customer/chat";

/** Opens the chat bubble's panel from a page: tagged with an order, or started with a product's name. */
export function AskShop({ label, detail, className = "" }: { label: string; detail: OpenChatDetail; className?: string }) {
  return (
    <button type="button" onClick={() => openChat(detail)} className={`press inline-flex items-center justify-center gap-2 ${className}`}>
      <MessageCircle aria-hidden="true" className="size-[1.125rem]" strokeWidth={1.9} />
      {label}
    </button>
  );
}
