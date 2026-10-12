import { cache } from "react";
import { redirect } from "next/navigation";
import { STAFF_HOME } from "@/components/admin/nav";
import { CUSTOMER_HOME } from "@/lib/paths";
import { createClient } from "@/lib/supabase/server";

export { STAFF_HOME };

export type StaffRole = "staff" | "owner";

export type StaffProfile = {
  id: string;
  username: string;
  full_name: string | null;
  role: StaffRole;
};

/**
 * The admin's authorization check. Verifies the session on the server and loads the
 * profile; customers are sent to their own app. Cached per request, so
 * the layout and page share one lookup.
 */
export const requireStaff = cache(async () => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/?auth=login&next=/admin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, full_name, role")
    .eq("id", userId)
    .single<{ id: string; username: string; full_name: string | null; role: string }>();

  if (!profile) redirect("/");
  // Customers have their own app.
  if (profile.role !== "staff" && profile.role !== "owner") redirect(CUSTOMER_HOME);

  return { supabase, profile: profile as StaffProfile };
});

/** Owner-only pages: staff are sent to the point of sale. */
export async function requireOwner() {
  const session = await requireStaff();
  if (session.profile.role !== "owner") redirect(STAFF_HOME);
  return session;
}

/**
 * Owner-only server actions: the owner's session, or null for staff. Every check runs here
 * too, since server actions can be called directly; callers answer staff with a message.
 */
export async function ownerSession() {
  const session = await requireStaff();
  return session.profile.role === "owner" ? session : null;
}

export function firstName(profile: Pick<StaffProfile, "full_name" | "username">) {
  return profile.full_name?.trim().split(/\s+/)[0] || profile.username;
}
