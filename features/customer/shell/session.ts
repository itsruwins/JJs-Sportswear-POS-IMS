import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CUSTOMER_HOME } from "@/lib/paths";

export type CustomerProfile = {
  id: string;
  username: string;
  full_name: string | null;
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, full_name, phone, email, avatar_url, created_at, role")
    .eq("id", userId)
    .single<CustomerProfile & { role: string }>();

  if (!profile) redirect(`/?auth=login&next=${CUSTOMER_HOME}`);
  if (profile.role !== "customer") redirect("/admin");

  const { id, username, full_name, phone, email, avatar_url, created_at } = profile;
  return { supabase, profile: { id, username, full_name, phone, email, avatar_url, created_at } satisfies CustomerProfile };
});

export function initials(fullName: string | null, username: string) {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] ?? username[0] ?? "?").toUpperCase();
}
