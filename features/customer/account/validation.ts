// The customer's own details on the Account page: what they can change and the rules for it.
// The username can't change (it's how they log in). Safe for client components.

import { PASSWORD_MIN } from "@/features/shared/auth/credentials";

export type DetailsDraft = { fullName: string; phone: string; email: string };
export type DetailsErrors = Partial<Record<keyof DetailsDraft, string>>;

export const NAME_MAX = 80;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Phone numbers as people type them ("0917 123 4567", "+63 917 123 4567"): 7 to 15 digits. */
export function checkPhone(phone: string) {
  if (!phone) return null;
  if (!/^[+\d][\d\s()-]*$/.test(phone)) return "Use numbers only, like 0917 123 4567.";
  const digits = phone.replace(/\D/g, "").length;
  if (digits < 7 || digits > 15) return "That number looks too short or too long. Try 0917 123 4567.";
  return null;
}

export function checkDetails(d: DetailsDraft): DetailsErrors {
  const e: DetailsErrors = {};
  const name = d.fullName.trim();
  if (name.length < 2) e.fullName = "Add your name, so the shop knows who’s ordering.";
  else if (name.length > NAME_MAX) e.fullName = `Keep it under ${NAME_MAX} characters.`;
  const phone = checkPhone(d.phone.trim());
  if (phone) e.phone = phone;
  const email = d.email.trim();
  if (email && (email.length > 254 || !EMAIL.test(email))) e.email = "That email doesn’t look right. Check it, or leave it blank.";
  return e;
}

export type PasswordDraft = { current: string; next: string; confirm: string };
export type PasswordErrors = Partial<Record<keyof PasswordDraft | "form", string>>;

export function checkPassword(d: PasswordDraft): PasswordErrors {
  const e: PasswordErrors = {};
  if (!d.current) e.current = "Enter the password you use now.";
  if (d.next.length < PASSWORD_MIN) e.next = `Use at least ${PASSWORD_MIN} characters.`;
  else if (d.next === d.current) e.next = "Pick a password that’s different from your current one.";
  if (!e.next && d.confirm !== d.next) e.confirm = "This doesn’t match the new password.";
  return e;
}

/** A profile photo: `<user id>/<uuid>.webp` in the public avatars bucket. */
export const AVATAR_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/;
export const AVATAR_SIZE = 512;
