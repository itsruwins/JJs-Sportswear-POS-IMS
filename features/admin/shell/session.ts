import { cache } from "react";
import { redirect } from "next/navigation";
import { STAFF_HOME } from "./nav";
import { CUSTOMER_HOME } from "@/lib/paths";
import { createClient } from "@/lib/supabase/server";
import { splitName } from "@/features/shared/names/model";

export { STAFF_HOME };

export type StaffRole = "staff" | "owner";

export type StaffProfile = {
  id: string;
  username: string;
  full_name: string | null;
  /** Missing until the name-parts update (20261030000000) has run. */
  first_name?: string | null;
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

  // Every column, so a database without the name-parts update still signs in.
  const { data: row } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single<{ id: string; username: string; full_name: string | null; first_name?: string | null; role: string }>();

  if (!row) redirect("/");
  // Customers have their own app.
  if (row.role !== "staff" && row.role !== "owner") redirect(CUSTOMER_HOME);

  const profile: StaffProfile = { id: row.id, username: row.username, full_name: row.full_name, first_name: row.first_name ?? null, role: row.role };
  return { supabase, profile };
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

export function firstName(profile: Pick<StaffProfile, "first_name" | "full_name" | "username">) {
  return profile.first_name || splitName(profile.full_name ?? "").firstName || profile.username;
}
