import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type StaffRole = "staff" | "owner";

export type StaffProfile = {
  id: string;
  username: string;
  full_name: string | null;
  role: StaffRole;
};

/**
 * The admin's authorization check. Verifies the session on the server and loads the
 * profile; anyone who isn't staff or the owner is redirected. Cached per request, so
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

  if (!profile || (profile.role !== "staff" && profile.role !== "owner")) redirect("/");

  return { supabase, profile: profile as StaffProfile };
});

export function firstName(profile: Pick<StaffProfile, "full_name" | "username">) {
  return profile.full_name?.trim().split(/\s+/)[0] || profile.username;
}
