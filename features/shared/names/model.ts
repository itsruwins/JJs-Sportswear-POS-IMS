// A person's name in parts (First, Middle, Last, Suffix): how a part is tidied, how the
// parts combine into one name ("Juan D. Dela Cruz Jr."), and how one name splits into parts.
// Mirrors the SQL helpers in supabase/migrations/20261030000000_name_parts.sql, which the
// database applies on every write; keep the two in step. Safe for client components.

export const SUFFIXES = ["Jr.", "Sr.", "II", "III", "IV", "V"] as const;
export type Suffix = (typeof SUFFIXES)[number];

/** Each part is at most this long. */
export const NAME_PART_MAX = 50;

export type NameParts = { firstName: string; middleName: string; lastName: string; suffix: Suffix | "" };

export const blankName = (): NameParts => ({ firstName: "", middleName: "", lastName: "", suffix: "" });

/** The name columns as a row has them (profiles, or custom_orders without the walk_in_ prefix). */
export type NameRow = { first_name: string | null; middle_name: string | null; last_name: string | null; suffix: string | null };

/** Letters (accented ones too), spaces, periods, apostrophes, and hyphens. Same set as `private.name_part_ok`. */
export const NAME_PART_CHARS = /^[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ .'-]+$/;
const HAS_LETTER = /[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]/;

export const isNamePartOk = (part: string) => part.length <= NAME_PART_MAX && NAME_PART_CHARS.test(part) && HAS_LETTER.test(part);

/**
 * One part, tidied like Postgres's `initcap`: curly apostrophes made straight, spaces trimmed
 * and collapsed, and every word title-cased ("dela cruz" → "Dela Cruz", "o'brien" → "O'Brien").
 */
export function cleanNamePart(part: string): string {
  return part
    .replace(/’/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
}

/** A suffix written any way ("jr", "JR.", "iii") as it's stored ("Jr.", "III"); "" when it isn't one. */
export function toSuffix(s: string): Suffix | "" {
  const key = s.trim().replace(/\.+$/, "").toLowerCase();
  return SUFFIXES.find((x) => x.replace(/\.$/, "").toLowerCase() === key) ?? "";
}

/** Every part tidied, the way the database will store it. */
export function cleanName(p: NameParts): NameParts {
  return { firstName: cleanNamePart(p.firstName), middleName: cleanNamePart(p.middleName), lastName: cleanNamePart(p.lastName), suffix: toSuffix(p.suffix) };
}

/** The combined name: "Juan D. Dela Cruz Jr." (the middle name as an initial). "" with no first or last name. */
export function formatName(p: NameParts): string {
  const c = cleanName(p);
  if (!c.firstName && !c.lastName) return "";
  const initial = c.middleName ? `${c.middleName[0].toUpperCase()}.` : "";
  return [c.firstName, initial, c.lastName, c.suffix].filter(Boolean).join(" ");
}

const PARTICLES = new Set(["de", "del", "dela", "della", "la", "las", "los", "delos", "delas", "san", "santa", "santo", "sta", "sto", "di", "da", "dos", "van", "von"]);
const bare = (word: string) => word.replace(/\.+$/, "").toLowerCase();

/**
 * One whole name split into parts, for a name typed in a single box. A trailing suffix comes
 * off, the last word is the last name, the particles in front of it (de, dela, san, sta., ...)
 * join it, and everything before is the first name. The middle name stays empty.
 */
export function splitName(full: string): NameParts {
  const words = full.replace(/,/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const out = blankName();
  if (words.length >= 3 && toSuffix(words[words.length - 1])) out.suffix = toSuffix(words.pop()!);
  if (words.length === 1) out.firstName = words[0].slice(0, NAME_PART_MAX);
  if (words.length < 2) return cleanName(out);
  let i = words.length - 1;
  while (i > 1 && PARTICLES.has(bare(words[i - 1]))) i--;
  out.firstName = words.slice(0, i).join(" ").slice(0, NAME_PART_MAX);
  out.lastName = words.slice(i).join(" ").slice(0, NAME_PART_MAX);
  return cleanName(out);
}

/** A row's name columns as parts. */
export function nameFromRow(r: Partial<NameRow> | null | undefined): NameParts {
  return {
    firstName: r?.first_name ?? "",
    middleName: r?.middle_name ?? "",
    lastName: r?.last_name ?? "",
    suffix: toSuffix(r?.suffix ?? ""),
  };
}

/** Parts as row columns, tidied, with empty parts as null. */
export function nameToRow(p: NameParts): NameRow {
  const c = cleanName(p);
  return { first_name: c.firstName || null, middle_name: c.middleName || null, last_name: c.lastName || null, suffix: c.suffix || null };
}

/**
 * Two initials from a combined name: first name and last name, skipping the middle initial and
 * the suffix ("Juan D. Dela Cruz Jr." → "JD"). A note in brackets ("(sample)") is ignored.
 * "" when there's no name, so the caller can fall back to the username.
 */
export function initialsOf(full: string | null | undefined): string {
  const p = splitName((full ?? "").replace(/\(.*?\)/g, " "));
  return ((p.firstName[0] ?? "") + (p.lastName[0] ?? "")).toUpperCase();
}
