import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChatShell } from "@/components/admin/chat/chat-shell";
import { LiveRefresh } from "@/features/shared/ui/live-refresh";
import { CHAT_MIGRATION, fetchInbox } from "@/lib/admin/chat";
import { requireStaff, STAFF_HOME } from "@/lib/admin/session";

export const metadata: Metadata = { title: "Chat · J&J Sportswear Admin" };

/** The owner's chat with customers: the inbox, and the open conversation beside it. */
export default async function ChatLayout({ children }: LayoutProps<"/admin/chat">) {
  const { supabase, profile } = await requireStaff();
  if (profile.role !== "owner") redirect(STAFF_HOME);
  const { rows, migrated, error } = await fetchInbox(supabase);

  return (
    <>
      <LiveRefresh tables={["chat_messages"]} />
      <ChatShell rows={rows} migrated={migrated} error={error} nowIso={new Date().toISOString()} migration={CHAT_MIGRATION} ownerId={profile.id}>
        {children}
      </ChatShell>
    </>
  );
}
