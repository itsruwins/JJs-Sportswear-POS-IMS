import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LiveRefresh } from "@/features/shared/ui/live-refresh";
import { StaffScreen } from "@/features/admin/staff/components/staff-screen";
import { requireStaff, STAFF_HOME } from "@/features/admin/shell/session";
import { fetchTeam } from "@/features/admin/staff/data";

export const metadata: Metadata = { title: "Staff · J&J Sportswear Admin" };

/** The owner's staff screen: who can use the admin, and adding or removing people. */
export default async function StaffPage() {
  const { supabase, profile } = await requireStaff();
  if (profile.role !== "owner") redirect(STAFF_HOME);

  const { members, error } = await fetchTeam(supabase);

  return (
    <div className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10">
      <LiveRefresh />
      <header>
        <h1 className="voice-display text-[clamp(2.25rem,5vw,3.5rem)]">Staff</h1>
        <p className="mt-2 max-w-[60ch] text-[0.9375rem] text-ink-2">
          Who can use the admin. Staff manage products and stock; owners can also delete products, see reports, and
          manage staff.
        </p>
      </header>

      {error ? (
        <p role="alert" className="auth-alert mt-8 rounded-2xl px-5 py-4 text-[0.9375rem]">
          We couldn’t load the team just now. Refresh the page to try again.
        </p>
      ) : (
        <StaffScreen members={members} meId={profile.id} />
      )}
    </div>
  );
}
