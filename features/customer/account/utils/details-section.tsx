'use client';

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { checkDetails, type DetailsDraft, type DetailsErrors } from "@/features/customer/account/validation";
import { NameFields } from "@/features/shared/names/components/name-fields";
import { cleanName } from "@/features/shared/names/model";
import {Props} from '../types/personal-type'
import {focusFirstError} from '../focus-first-error'
import { saveDetails } from "@/features/customer/account/actions";
import {sectionTitle, label, hint, errorText} from '../reusable/account-reusable';
import { Check, LoaderCircle } from "lucide-react";

export function DetailsSection({ username, name, phone, email }: Props) {
    const router = useRouter();
    const ids = { phone: useId(), email: useId() };
    const form = useRef<HTMLFormElement>(null);
    const [saved, setSaved] = useState<DetailsDraft>({ ...name, phone: phone ?? "", email: email ?? "" });
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
      // The name as the database stores it (title-cased, spaces tidied).
      const next = { ...cleanName(draft), phone: draft.phone.trim(), email: draft.email.trim().toLowerCase() };
      setSaved(next);
      setDraft(next);
      setDone(true);
      router.refresh();
    };
  
    const field = (key: "phone" | "email") => ({
      "aria-invalid": Boolean(errors[key]) || undefined,
      "aria-describedby": `${ids[key]}-msg`,
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
          <div className="flex flex-col gap-4">
            {!saved.lastName && (
              <p className="rounded-xl bg-ground-2 px-4 py-3 text-[0.9375rem] leading-snug text-ink shadow-[inset_0_0_0_1px_var(--line)]">
                <span className="font-semibold">Add your last name.</span>{" "}
                {saved.firstName ? "Your name now has separate parts, and only your first name came across." : "The shop uses it on your orders and receipts."}
              </p>
            )}
            <NameFields value={draft} errors={errors} onChange={patch} />
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
              className="press inline-flex h-12 items-center justify-center gap-2 rounded-full bg-action px-6 text-[0.9375rem] font-semibold text-action-ink hover:bg-action-deep disabled:bg-ground-2 disabled:text-ink-2 disabled:shadow-[inset_0_0_0_1px_var(--line)]"
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