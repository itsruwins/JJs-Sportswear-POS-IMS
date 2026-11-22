// Checks for a typed name: First and Last are required, Middle and Suffix are optional.
// The database tidies and stores the same rules (see ./model.ts). Safe for client components.

import { cleanNamePart, isNamePartOk, NAME_PART_MAX, SUFFIXES, type NameParts } from "@/features/shared/names/model";

export type NameErrors = Partial<Record<keyof NameParts, string>>;

const LABEL: Record<Exclude<keyof NameParts, "suffix">, string> = { firstName: "first name", middleName: "middle name", lastName: "last name" };

/**
 * Field errors for a name. `whose` words the required messages: "your" on the customer's own
 * forms ("Add your first name."), "the buyer’s" at the counter.
 */
export function checkName(p: NameParts, whose = "your"): NameErrors {
  const e: NameErrors = {};
  for (const key of ["firstName", "middleName", "lastName"] as const) {
    const part = cleanNamePart(p[key]);
    if (!part) {
      if (key !== "middleName") e[key] = `Add ${whose} ${LABEL[key]}.`;
    } else if (part.length > NAME_PART_MAX) {
      e[key] = `Keep it to ${NAME_PART_MAX} characters or fewer.`;
    } else if (!isNamePartOk(part)) {
      e[key] = "Use letters, spaces, periods, apostrophes, or hyphens.";
    }
  }
  if (p.suffix && !(SUFFIXES as readonly string[]).includes(p.suffix)) e.suffix = "Pick a suffix from the list.";
  return e;
}
