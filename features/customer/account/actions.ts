"use server";

import { revalidatePath } from "next/cache";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { usernameToEmail } from "@/features/shared/auth/credentials";
import { AVATAR_PATH, checkDetails, checkPassword, type DetailsDraft, type DetailsErrors, type PasswordDraft, type PasswordErrors } from "./validation";
import { requireCustomer } from "@/features/customer/shell/session";

export type DetailsResult = { ok: true } | { ok: false; errors: DetailsErrors & { form?: string } };
export type PasswordResult = { ok: true } | { ok: false; errors: PasswordErrors };
export type PhotoResult = { ok: true; url: string | null } | { ok: false; message: string };

const text = (v: unknown) => (typeof v === "string" ? v : "");

/** Name, phone, and email. The username stays as it is. */
export async function saveDetails(raw: DetailsDraft): Promise<DetailsResult> {
  const { supabase, profile } = await requireCustomer();
  const d = { fullName: text(raw?.fullName), phone: text(raw?.phone), email: text(raw?.email) };
  const errors = checkDetails(d);
  if (Object.keys(errors).length) return { ok: false, errors };
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: d.fullName.trim().replace(/\s+/g, " "), phone: d.phone.trim().replace(/\s+/g, " ") || null, email: d.email.trim().toLowerCase() || null })
    .eq("id", profile.id);
  if (error) return { ok: false, errors: { form: "We couldn’t save your details. Check your connection and try again." } };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** A new password, after checking the current one. Stays signed in. */
export async function changePassword(raw: PasswordDraft): Promise<PasswordResult> {
  const { supabase, profile } = await requireCustomer();
  const d = { current: text(raw?.current), next: text(raw?.next), confirm: text(raw?.confirm) };
  const errors = checkPassword(d);
  if (Object.keys(errors).length) return { ok: false, errors };

  // Check the current password on a separate client that keeps no session, so a wrong guess
  // can't touch the customer's own sign-in.
  const checker = createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const check = await checker.auth.signInWithPassword({ email: usernameToEmail(profile.username), password: d.current });
  if (check.error || check.data.user?.id !== profile.id) {
    if (check.error?.status === 429) return { ok: false, errors: { form: "Too many tries. Wait a few minutes, then try again." } };
    if (check.error && !check.error.status) return { ok: false, errors: { form: "We couldn’t reach the shop’s server. Check your connection and try again." } };
    return { ok: false, errors: { current: "That isn’t your current password." } };
  }
  await checker.auth.signOut({ scope: "local" });

  const { error } = await supabase.auth.updateUser({ password: d.next });
  if (error) {
    if (error.code === "weak_password") return { ok: false, errors: { next: error.message || "Choose a stronger password." } };
    if (error.code === "same_password") return { ok: false, errors: { next: "Pick a password that’s different from your current one." } };
    return { ok: false, errors: { form: "We couldn’t change your password. Try again in a moment." } };
  }
  return { ok: true };
}

/** Points the profile at a photo just uploaded to the avatars bucket, and clears out older ones. */
export async function setPhoto(path: string): Promise<PhotoResult> {
  const { supabase, profile } = await requireCustomer();
  if (typeof path !== "string" || !AVATAR_PATH.test(path) || !path.startsWith(`${profile.id}/`)) return { ok: false, message: "That photo didn’t upload. Try again." };
  const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", profile.id);
  if (error) return { ok: false, message: "We couldn’t save your photo. Try again." };
  await clearOldPhotos(supabase, profile.id, path);
  revalidatePath("/", "layout");
  return { ok: true, url };
}

export async function removePhoto(): Promise<PhotoResult> {
  const { supabase, profile } = await requireCustomer();
  const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", profile.id);
  if (error) return { ok: false, message: "We couldn’t remove your photo. Try again." };
  await clearOldPhotos(supabase, profile.id, null);
  revalidatePath("/", "layout");
  return { ok: true, url: null };
}

type Supabase = Awaited<ReturnType<typeof requireCustomer>>["supabase"];
async function clearOldPhotos(supabase: Supabase, uid: string, keep: string | null) {
  const { data } = await supabase.storage.from("avatars").list(uid, { limit: 100 });
  const old = (data ?? []).map((f) => `${uid}/${f.name}`).filter((p) => p !== keep);
  if (old.length) await supabase.storage.from("avatars").remove(old);
}
