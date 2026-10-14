import type { Metadata } from "next";
import { ChatWidget } from "@/features/customer/chat/components/chat-widget";
import { CustomerDock } from "@/features/customer/shell/components/customer-dock";
import { CustomerTopBar } from "@/features/customer/shell/components/customer-top-bar";
import { SHOP } from "@/lib/shop";
import { fetchChatUnread } from "@/features/customer/chat/data";
import { initials, requireCustomer } from "@/features/customer/shell/session";

export const metadata: Metadata = {
  title: "J&J Sportswear",
  robots: { index: false, follow: false },
};

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await requireCustomer();
  const unread = (await fetchChatUnread(supabase, profile.id)) ?? 0;
  const firstName = profile.full_name?.replace(/\(.*?\)/g, "").trim().split(/\s+/)[0] || profile.username;

  return (
    <>
      <a
        href="#main"
        className="sr-only fixed left-4 top-3 z-[var(--z-skip)] rounded-lg bg-ink px-4 py-2 text-ground focus:not-sr-only"
      >
        Skip to content
      </a>
      <CustomerTopBar
        userId={profile.id}
        avatarUrl={profile.avatar_url}
        username={profile.username}
        fullName={profile.full_name}
        initials={initials(profile.full_name, profile.username)}
      />
      {/* Room for the dock on phones and tablets; desktop has no dock. */}
      {/* Phones keep room for the chat bubble too, above the home indicator. */}
      <main id="main" className="flex-1 pb-[calc(9.5rem+env(safe-area-inset-bottom))] sm:pb-40 lg:pb-20">
        {children}
      </main>
      <CustomerDock />
      {/* Chat with the shop: a bubble over every page instead of a tab. */}
      <ChatWidget uid={profile.id} firstName={firstName} initialUnread={unread} hours={SHOP.hours} />
    </>
  );
}
