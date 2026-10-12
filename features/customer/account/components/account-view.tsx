"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { changePassword, removePhoto, saveDetails, setPhoto } from "@/features/customer/account/actions";
import { AVATAR_SIZE, checkDetails, checkPassword, NAME_MAX, type DetailsDraft, type DetailsErrors, type PasswordDraft, type PasswordErrors } from "@/features/customer/account/validation";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/features/customer/shell/components/avatar";
import { LogOutButton } from "@/features/customer/shell/components/log-out-button";
import { PageHeader, pageShell } from "@/features/customer/shell/components/page-parts";

const label = "text-[0.9375rem] font-semibold text-ink";
const hint = "mt-1.5 text-[0.8125rem] leading-relaxed text-ink-2";
const errorText = "mt-2 text-[0.875rem] font-semibold text-ink";
const sectionTitle = "voice-display border-b border-line pb-3 text-[1.75rem]";

type Props = {
  uid: string;
  username: string;
  initials: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  joined: string;
};

/** Crops a picked photo to a centered square and shrinks it to 512px WebP. */
async function squarePhoto(file: File) {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That file isn’t a photo this browser can read. Try a JPG or PNG.");
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(AVATAR_SIZE, side);
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.88));
  if (!blob) throw new Error("We couldn’t prepare that photo. Try another one.");
  return blob;
}

/** Moves focus to the first field with a problem. */
function focusFirstError(form: HTMLFormElement | null) {
  requestAnimationFrame(() => form?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
}

export function AccountView(p: Props) {
  return (
    <div className={pageShell}>
      <PageHeader title="Account" sub="The details the shop sees when you order or message them." />
      <div className="flex max-w-[40rem] flex-col gap-12">
        <PhotoSection {...p} />
        <DetailsSection {...p} />
        <PasswordSection />
        <section aria-labelledby="leave-title">
          <h2 id="leave-title" className="sr-only">
            Log out
          </h2>
          <p className="text-[0.875rem] text-ink-2">Member since {p.joined}</p>
          <LogOutButton className="mt-4" />
        </section>
      </div>
    </div>
  );
}

function PhotoSection({ uid, username, initials, fullName, avatarUrl }: Props) {
  const router = useRouter();
  const [url, setUrl] = useState(avatarUrl);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState("");

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy("upload");
    setError("");
    try {
      const blob = await squarePhoto(file);
      const path = `${uid}/${crypto.randomUUID()}.webp`;
      const up = await createClient().storage.from("avatars").upload(path, blob, { contentType: "image/webp" });
      if (up.error) throw new Error("The photo didn’t upload. Check your connection and try again.");
      const r = await setPhoto(path);
      if (!r.ok) throw new Error(r.message);
      setUrl(r.url);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The photo didn’t upload. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("remove");
    setError("");
    const r = await removePhoto();
    setBusy(null);
    if (!r.ok) return setError(r.message);
    setUrl(null);
    router.refresh();
  };

  return (
    <section aria-labelledby="photo-title">
      <h2 id="photo-title" className="sr-only">
        Profile photo
      </h2>
      <div className="flex items-center gap-4 sm:gap-5">
        <div className="relative shrink-0">
          <Avatar url={url} initials={initials} className="size-20 text-[1.5rem] sm:size-24 sm:text-[1.75rem]" />
          {busy === "upload" && (
            <span className="absolute inset-0 grid place-items-center rounded-full bg-ground/70" role="status">
              <LoaderCircle aria-hidden="true" className="size-6 animate-spin text-ink" />
              <span className="sr-only">Uploading your photo…</span>
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[1.25rem] font-semibold text-ink">{fullName || `@${username}`}</p>
          <p className="truncate text-[0.9375rem] text-ink-2">@{username}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="press inline-flex h-10 cursor-pointer items-center gap-2 rounded-full px-4 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2 focus-within:shadow-[0_0_0_2px_var(--amber)]">
              <Camera aria-hidden="true" className="size-[1.125rem] text-ink-2" />
              {url ? "Change photo" : "Add a photo"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={busy !== null}
                onChange={(e) => {
                  upload(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {url && (
              <button
                type="button"
                onClick={remove}
                disabled={busy !== null}
                className="press inline-flex h-10 items-center rounded-full px-3 text-[0.9375rem] font-semibold text-ink-2 hover:bg-ground-2 hover:text-ink disabled:opacity-60"
              >
                {busy === "remove" ? "Removing…" : "Remove"}
              </button>
            )}
          </div>
          {error ? (
            <p role="alert" className={errorText}>
              {error}
            </p>
          ) : (
            <p className={hint}>The shop sees your photo in messages and on your orders.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function DetailsSection({ username, fullName, phone, email }: Props) {
  const router = useRouter();
  const ids = { name: useId(), phone: useId(), email: useId() };
  const form = useRef<HTMLFormElement>(null);
  const [saved, setSaved] = useState<DetailsDraft>({ fullName: fullName ?? "", phone: phone ?? "", email: email ?? "" });
  const [draft, setDraft] = useState<DetailsDraft>(saved);
  const [errors, setErrors] = useState<DetailsErrors & { form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const changed = (Object.keys(draft) as (keyof DetailsDraft)[]).some((k) => draft[k].trim() !== saved[k].trim());

  // "Saved" is a moment's confirmation, not a lasting state.
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => setDone(false), 4000);
    return () => window.clearTimeout(t);
  }, [done]);

  const patch = (p: Partial<DetailsDraft>) => {
    setDraft((d) => ({ ...d, ...p }));
    setDone(false);
    const key = Object.keys(p)[0] as keyof DetailsDraft;
    if (errors[key] || errors.form) setErrors((e) => ({ ...e, [key]: undefined, form: undefined }));
  };

  const submit = async () => {
    const found = checkDetails(draft);
    if (Object.keys(found).length) {
      setErrors(found);
      return focusFirstError(form.current);
    }
    setBusy(true);
    const r = await saveDetails(draft);
    setBusy(false);
    if (!r.ok) {
      setErrors(r.errors);
      return focusFirstError(form.current);
    }
    const next = { fullName: draft.fullName.trim(), phone: draft.phone.trim(), email: draft.email.trim().toLowerCase() };
    setSaved(next);
    setDraft(next);
    setDone(true);
    router.refresh();
  };

  const field = (key: keyof DetailsDraft) => ({
    "aria-invalid": Boolean(errors[key]) || undefined,
    "aria-describedby": `${ids[key === "fullName" ? "name" : key]}-msg`,
    className: `auth-input mt-2 px-4 ${errors[key] ? "is-error" : ""}`,
  });

  return (
    <section aria-labelledby="details-title">
      <h2 id="details-title" className={sectionTitle}>
        Your details
      </h2>
      <form
        ref={form}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="mt-6 flex flex-col gap-6"
      >
        <div>
          <p className={label}>Username</p>
          <p className="mt-2 text-[1rem] text-ink">@{username}</p>
          <p className={hint}>You log in with this. It can’t be changed.</p>
        </div>
        <div>
          <label htmlFor={ids.name} className={label}>
            Name
          </label>
          <input id={ids.name} value={draft.fullName} onChange={(e) => patch({ fullName: e.target.value })} maxLength={NAME_MAX + 10} autoComplete="name" {...field("fullName")} />
          <p id={`${ids.name}-msg`} className={errors.fullName ? errorText : "sr-only"}>
            {errors.fullName}
          </p>
        </div>
        <div>
          <label htmlFor={ids.phone} className={label}>
            Phone <span className="font-normal text-ink-2">(optional)</span>
          </label>
          <input
            id={ids.phone}
            type="tel"
            inputMode="tel"
            value={draft.phone}
            onChange={(e) => patch({ phone: e.target.value })}
            maxLength={24}
            autoComplete="tel"
            placeholder="0917 123 4567"
            {...field("phone")}
          />
          <p id={`${ids.phone}-msg`} className={errors.phone ? errorText : hint}>
            {errors.phone ?? "So the shop can call you about an order."}
          </p>
        </div>
        <div>
          <label htmlFor={ids.email} className={label}>
            Email <span className="font-normal text-ink-2">(optional)</span>
          </label>
          <input
            id={ids.email}
            type="email"
            inputMode="email"
            value={draft.email}
            onChange={(e) => patch({ email: e.target.value })}
            maxLength={254}
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            {...field("email")}
          />
          <p id={`${ids.email}-msg`} className={errors.email ? errorText : hint}>
            {errors.email ?? "Only for reaching you. You log in with your username."}
          </p>
        </div>
        {errors.form && (
          <p role="alert" className="auth-alert rounded-xl px-4 py-3 text-[0.9375rem]">
            {errors.form}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={busy || !changed}
            className="press inline-flex h-12 items-center justify-center gap-2 rounded-full bg-board px-6 text-[0.9375rem] font-semibold text-board-ink hover:bg-board-deep disabled:bg-ground-2 disabled:text-ink-2 disabled:shadow-[inset_0_0_0_1px_var(--line)]"
          >
            {busy && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
            {busy ? "Saving…" : "Save changes"}
          </button>
          <p role="status" className="inline-flex items-center gap-1.5 text-[0.9375rem] font-semibold text-ink">
            {done && !changed && (
              <>
                <Check aria-hidden="true" className="size-4" />
                Saved
              </>
            )}
          </p>
        </div>
      </form>
    </section>
  );
}

function PasswordSection() {
  const ids = { current: useId(), next: useId(), confirm: useId() };
  const form = useRef<HTMLFormElement>(null);
  const blank: PasswordDraft = { current: "", next: "", confirm: "" };
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PasswordDraft>(blank);
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const patch = (p: Partial<PasswordDraft>) => {
    setDraft((d) => ({ ...d, ...p }));
    const key = Object.keys(p)[0] as keyof PasswordDraft;
    if (errors[key] || errors.form) setErrors((e) => ({ ...e, [key]: undefined, form: undefined }));
  };

  const submit = async () => {
    const found = checkPassword(draft);
    if (Object.keys(found).length) {
      setErrors(found);
      return focusFirstError(form.current);
    }
    setBusy(true);
    const r = await changePassword(draft);
    setBusy(false);
    if (!r.ok) {
      setErrors(r.errors);
      return focusFirstError(form.current);
    }
    setDraft(blank);
    setErrors({});
    setOpen(false);
    setDone(true);
  };

  const input = (key: keyof PasswordDraft, autoComplete: string) => ({
    id: ids[key],
    type: show ? "text" : "password",
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => patch({ [key]: e.target.value }),
    autoComplete,
    "aria-invalid": Boolean(errors[key]) || undefined,
    "aria-describedby": `${ids[key]}-msg`,
    className: `auth-input mt-2 px-4 ${errors[key] ? "is-error" : ""}`,
  });

  return (
    <section aria-labelledby="password-title">
      <h2 id="password-title" className={sectionTitle}>
        Password
      </h2>
      {!open ? (
        <div className="mt-6">
          <p role="status" className="text-[0.9375rem] text-ink-2">
            {done ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                <Check aria-hidden="true" className="size-4" />
                Password changed. Use the new one next time you log in.
              </span>
            ) : (
              "Change it any time. You’ll need the one you use now."
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setDone(false);
              requestAnimationFrame(() => document.getElementById(ids.current)?.focus());
            }}
            className="press mt-4 inline-flex h-11 items-center rounded-full px-5 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--ink)] hover:bg-ground-2"
          >
            Change password
          </button>
        </div>
      ) : (
        <form
          ref={form}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="mt-6 flex flex-col gap-6"
        >
          <div>
            <label htmlFor={ids.current} className={label}>
              Current password
            </label>
            <input {...input("current", "current-password")} />
            <p id={`${ids.current}-msg`} className={errors.current ? errorText : "sr-only"}>
              {errors.current}
            </p>
          </div>
          <div>
            <label htmlFor={ids.next} className={label}>
              New password
            </label>
            <input {...input("next", "new-password")} />
            <p id={`${ids.next}-msg`} className={errors.next ? errorText : hint}>
              {errors.next ?? "At least 8 characters."}
            </p>
          </div>
          <div>
            <label htmlFor={ids.confirm} className={label}>
              New password again
            </label>
            <input {...input("confirm", "new-password")} />
            <p id={`${ids.confirm}-msg`} className={errors.confirm ? errorText : "sr-only"}>
              {errors.confirm}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-pressed={show}
            className="press -mt-2 inline-flex w-fit items-center gap-2 rounded-full py-1 text-[0.875rem] font-semibold text-ink-2 hover:text-ink"
          >
            {show ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
            {show ? "Hide passwords" : "Show passwords"}
          </button>
          {errors.form && (
            <p role="alert" className="auth-alert rounded-xl px-4 py-3 text-[0.9375rem]">
              {errors.form}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="press inline-flex h-12 items-center justify-center gap-2 rounded-full bg-board px-6 text-[0.9375rem] font-semibold text-board-ink hover:bg-board-deep disabled:opacity-80"
            >
              {busy && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
              {busy ? "Changing…" : "Change password"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setDraft(blank);
                setErrors({});
              }}
              disabled={busy}
              className="press inline-flex h-12 items-center rounded-full px-5 text-[0.9375rem] font-semibold text-ink-2 hover:bg-ground-2 hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
