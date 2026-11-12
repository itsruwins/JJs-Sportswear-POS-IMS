import type { Metadata } from "next";
import { AdminDock } from "@/features/admin/shell/components/admin-dock";
import { AdminTopBar } from "@/features/admin/shell/components/admin-top-bar";
import { fetchUnreadChats } from "@/features/admin/chat/data";
import { requireStaff } from "@/features/admin/shell/session";
import { SHOP } from "@/lib/shop";

export const metadata: Metadata = {
  // The short name keeps the page name readable in a narrow tab: "Products · J&J Admin".
  title: { absolute: `${SHOP.short} Admin`, template: `%s · ${SHOP.short} Admin` },
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
