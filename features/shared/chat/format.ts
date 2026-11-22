import { initialsOf } from "@/features/shared/names/model";

const TZ = "Asia/Manila";

/** "MB" for Mara Belgica, "SM" for @sample.mara. */
export function initials(p: { username: string; full_name: string | null }) {
  const named = initialsOf(p.full_name);
  if (named) return named;
  const words = p.username.split(/[\s._-]+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase() || "?";
}

/** "Mara" for "Mara Belgica (sample)", else the username. */
export function firstNameOf(p: { username: string; full_name: string | null }) {
  return p.full_name?.replace(/\(.*?\)/g, "").trim().split(/\s+/)[0] || p.username;
}

const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);

/** "Today", "Yesterday", "Monday", or "Sep 28" for the day a message was sent, in Manila time. */
export function dayLabel(iso: string, now: Date) {
  const d = new Date(iso);
  const key = dayKey(d);
  if (key === dayKey(now)) return "Today";
  if (key === dayKey(new Date(now.getTime() - 86_400_000))) return "Yesterday";
  if (now.getTime() - d.getTime() < 6 * 86_400_000) return new Intl.DateTimeFormat("en-PH", { weekday: "long", timeZone: TZ }).format(d);
  const sameYear = dayKey(d).slice(0, 4) === dayKey(now).slice(0, 4);
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: sameYear ? undefined : "numeric", timeZone: TZ }).format(d);
}

export function sameDay(a: string, b: string) {
  return dayKey(new Date(a)) === dayKey(new Date(b));
}

export function clock(iso: string) {
  return new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
}

/** Inbox time: "2:14 PM" today, "Yesterday", "Mon" within the week, then "Sep 28". */
export function inboxTime(iso: string, now: Date) {
  const d = new Date(iso);
  const key = dayKey(d);
  if (key === dayKey(now)) return clock(iso);
  if (key === dayKey(new Date(now.getTime() - 86_400_000))) return "Yesterday";
  if (now.getTime() - d.getTime() < 6 * 86_400_000) return new Intl.DateTimeFormat("en-PH", { weekday: "short", timeZone: TZ }).format(d);
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: TZ }).format(d);
}
