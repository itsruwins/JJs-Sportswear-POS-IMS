import type { Metadata } from "next";
import { AdminDock } from "@/components/admin/admin-dock";
import { AdminTopBar } from "@/components/admin/admin-top-bar";
import { fetchUnreadChats } from "@/lib/admin/chat";
import { requireStaff } from "@/lib/admin/session";

export const metadata: Metadata = {
  title: "Admin · J&J Sportswear",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { supabase, profile } = await requireStaff();
  const unreadChats = profile.role === "owner" ? ((await fetchUnreadChats(supabase, profile.id)) ?? 0) : 0;

  return (
    <>
      <a
        href="#main"
        className="sr-only fixed left-4 top-3 z-[var(--z-skip)] rounded-lg bg-ink px-4 py-2 text-ground focus:not-sr-only"
      >
        Skip to content
      </a>
      <AdminTopBar userId={profile.id} username={profile.username} fullName={profile.full_name} role={profile.role} />
      <main id="main" className="flex-1 pb-36 sm:pb-40">
        {children}
      </main>
      <AdminDock role={profile.role} userId={profile.id} unreadChats={unreadChats} />
    </>
  );
}
