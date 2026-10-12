import type { SupabaseClient } from "@supabase/supabase-js";
import { manilaToday, shiftDate } from "@/features/admin/history/data";
import type { StaffRole } from "@/features/admin/shell/session";

export type AccountRole = "customer" | StaffRole;

/** An account as the Staff screen shows it. Dates arrive formatted (Manila time), so server and browser agree. */
export type Account = {
  id: string;
  username: string;
  name: string | null;
  role: AccountRole;
  email: string | null;
  phone: string | null;
  joined: string;
};

export type Member = Account & {
  role: StaffRole;
  /** "Today, 3:41 PM", "Yesterday", "Oct 2", or null when they've never changed stock. */
  lastChange: string | null;
};

const TZ = "Asia/Manila";
const dayKey = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

export function joinedDate(iso: string) {
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: TZ }).format(new Date(iso));
}

export function lastChangeLabel(iso: string, now = new Date()) {
  const today = manilaToday(now);
  const key = dayKey(iso);
  const time = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
  if (key === today) return `Today, ${time}`;
  if (key === shiftDate(today, -1)) return `Yesterday, ${time}`;
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), timeZone: TZ }).format(
    new Date(iso),
  );
}

type ProfileRow = {
  id: string;
  username: string;
  full_name: string | null;
  role: AccountRole;
  email: string | null;
  phone: string | null;
  created_at: string;
};

export const PROFILE_COLUMNS = "id, username, full_name, role, email, phone, created_at";

export function toAccount(p: ProfileRow): Account {
  return {
    id: p.id,
    username: p.username,
    name: p.full_name?.trim() || null,
    role: p.role,
    email: p.email?.trim() || null,
    phone: p.phone?.trim() || null,
    joined: joinedDate(p.created_at),
  };
}

/** Everyone who can use the admin, owners first, each with their latest stock change. */
export async function fetchTeam(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .in("role", ["owner", "staff"])
    .order("created_at")
    .returns<ProfileRow[]>();
  if (error) return { members: [] as Member[], error };

  // A shop's team is a handful of people, so one small lookup each is fine.
  const latest = await Promise.all(
    data.map((p) =>
      supabase
        .from("inventory_transactions")
        .select("created_at")
        .eq("created_by", p.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ created_at: string }>(),
    ),
  );

  const now = new Date();
  const members: Member[] = data.map((p, i) => ({
    ...toAccount(p),
    role: p.role as StaffRole,
    lastChange: latest[i].data ? lastChangeLabel(latest[i].data.created_at, now) : null,
  }));
  members.sort((a, b) => (a.role === b.role ? 0 : a.role === "owner" ? -1 : 1));
  return { members, error: null };
}

/** The name to show for an account: their full name, or @username. */
export function displayName(a: Pick<Account, "name" | "username">) {
  return a.name ?? `@${a.username}`;
}
