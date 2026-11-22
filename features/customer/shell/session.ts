import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CUSTOMER_HOME } from "@/lib/paths";
import { initialsOf, splitName } from "@/features/shared/names/model";

export type CustomerProfile = {
  id: string;
  username: string;
  full_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  suffix: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
};

/**
 * The customer app's authorization check. Verifies the session on the server and loads the
 * profile. Visitors without a session go to the landing page's login sheet (proxy.ts usually
 * catches them first); staff and owners belong in the admin. Cached per request, so the
 * layout and page share one lookup.
 */
export const requireCustomer = cache(async () => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect(`/?auth=login&next=${CUSTOMER_HOME}`);

  // Every column, so a database without the name-parts update (20261030000000) still signs in;
  // the name parts then come back missing and read as empty.
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single<Partial<CustomerProfile> & Pick<CustomerProfile, "id" | "username" | "created_at"> & { role: string }>();

  if (!profile) redirect(`/?auth=login&next=${CUSTOMER_HOME}`);
  if (profile.role !== "customer") redirect("/admin");

  const p = profile;
  return {
    supabase,
    profile: {
      id: p.id,
      username: p.username,
      full_name: p.full_name ?? null,
      first_name: p.first_name ?? null,
      middle_name: p.middle_name ?? null,
      last_name: p.last_name ?? null,
      suffix: p.suffix ?? null,
      phone: p.phone ?? null,
      email: p.email ?? null,
      avatar_url: p.avatar_url ?? null,
      created_at: p.created_at,
    } satisfies CustomerProfile,
  };
});

/** "JD" for Juan D. Dela Cruz Jr. (first and last name, past the middle initial and suffix). */
export function initials(fullName: string | null, username: string) {
  return initialsOf(fullName) || (username[0] ?? "?").toUpperCase();
}

/** What to call the customer: their first name, else the username. */
export function givenName(profile: Pick<CustomerProfile, "first_name" | "full_name" | "username">) {
  return profile.first_name || splitName((profile.full_name ?? "").replace(/\(.*?\)/g, " ")).firstName || profile.username;
}
