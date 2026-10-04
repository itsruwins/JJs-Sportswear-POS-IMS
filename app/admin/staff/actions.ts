"use server";

import { requireStaff } from "@/lib/admin/session";
import { displayName, PROFILE_COLUMNS, toAccount, type Account, type AccountRole } from "@/lib/admin/staff";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES: AccountRole[] = ["customer", "staff", "owner"];
const SEARCH_LIMIT = 12;

export type SearchResult = { ok: true; accounts: Account[]; more: boolean } | { ok: false; message: string };
export type RoleResult = { ok: true; message: string } | { ok: false; message: string; stale?: boolean };

/** Owner only. Every check runs here too, since server actions can be called directly. */
async function requireOwner() {
  const session = await requireStaff();
  return session.profile.role === "owner" ? session : null;
}

/** Customer accounts matching a username, name, email, or phone, for "Add staff". */
export async function searchAccounts(raw: string): Promise<SearchResult> {
  const session = await requireOwner();
  if (!session) return { ok: false, message: "Only the owner can manage staff." };

  // Characters that carry meaning in a PostgREST filter list (or as wildcards) are dropped rather than
  // escaped. Dots, underscores, and @ stay: usernames and emails use them.
  const q = (typeof raw === "string" ? raw : "")
    .replace(/[,()*%\\"']/g, " ")
    .trim()
    .replace(/^@/, "")
    .replace(/\s+/g, " ")
    .slice(0, 60);
  if (q.length < 2) return { ok: true, accounts: [], more: false };

  const like = `*${q}*`;
  // Phone numbers are stored as typed ("0917 555 0142", "+63 917…"), so a number matches its
  // digits in order whatever sits between them.
  const digits = /^[\d\s+-]+$/.test(q) ? q.replace(/\D/g, "") : "";
  const phone = digits.length >= 3 ? `*${digits.split("").join("*")}*` : like;
  const { data, error } = await session.supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("role", "customer")
    .or(`username.ilike.${like},full_name.ilike.${like},email.ilike.${like},phone.ilike.${phone}`)
    .order("username")
    .limit(SEARCH_LIMIT + 1);
  if (error) return { ok: false, message: "We couldn’t search accounts just now. Try again." };
  return { ok: true, accounts: data.slice(0, SEARCH_LIMIT).map(toAccount), more: data.length > SEARCH_LIMIT };
}

const DONE: Record<AccountRole, (who: string) => string> = {
  staff: (who) => `${who} is now staff.`,
  owner: (who) => `${who} is now an owner.`,
  customer: (who) => `${who} is no longer staff.`,
};

/**
 * Moves an account from one role to another through set_user_role, which also refuses to
 * remove the last owner. `from` is the role the owner saw, so a change made elsewhere in
 * the meantime isn't silently overwritten. Making someone an owner needs their username typed.
 */
export async function changeRole(userId: string, from: AccountRole, to: AccountRole, typed = ""): Promise<RoleResult> {
  const session = await requireOwner();
  if (!session) return { ok: false, message: "Only the owner can change roles." };
  const { supabase, profile } = session;

  // Server actions take whatever a POST sends, so every argument is type-checked, not just shaped.
  const valid =
    typeof userId === "string" && UUID.test(userId) && typeof typed === "string" && ROLES.includes(from) && ROLES.includes(to) && from !== to;
  if (!valid) {
    return { ok: false, message: "That change doesn’t make sense. Reload the page and try again." };
  }
  if (userId === profile.id) return { ok: false, message: "You can’t change your own role. Another owner can." };

  const { data: target, error: loadError } = await supabase
    .from("profiles")
    .select("id, username, full_name, role")
    .eq("id", userId)
    .maybeSingle<{ id: string; username: string; full_name: string | null; role: AccountRole }>();
  if (loadError) return { ok: false, message: "We couldn’t reach the database. Check your connection and try again." };
  if (!target) return { ok: false, message: "That account doesn’t exist anymore.", stale: true };

  const who = displayName({ name: target.full_name?.trim() || null, username: target.username });
  if (target.role !== from) {
    return { ok: false, message: `${who}’s role changed since this page loaded. The list now shows the latest.`, stale: true };
  }
  if (to === "owner" && typed.trim().replace(/^@/, "").toLowerCase() !== target.username.toLowerCase()) {
    return { ok: false, message: `Type ${target.username} exactly to confirm.` };
  }

  // p_expected makes the database re-check the role under its lock (supabase/migrations/
  // 20261006000000_safe_role_changes.sql). Until that migration runs, the older call is used.
  let { error } = await supabase.rpc("set_user_role", { p_user_id: userId, p_role: to, p_expected: from });
  if (error?.code === "PGRST202") ({ error } = await supabase.rpc("set_user_role", { p_user_id: userId, p_role: to }));
  if (error) {
    if (error.code === "40001") {
      return { ok: false, message: `${who}’s role changed since this page loaded. The list now shows the latest.`, stale: true };
    }
    if (/at least one owner/i.test(error.message)) return { ok: false, message: "The shop needs at least one owner, so this one has to stay." };
    if (error.code === "42501") return { ok: false, message: "Your account isn’t allowed to change roles." };
    if (error.code === "P0002") return { ok: false, message: "That account doesn’t exist anymore.", stale: true };
    return { ok: false, message: "We couldn’t change the role. Try again." };
  }
  return { ok: true, message: DONE[to](who) };
}
