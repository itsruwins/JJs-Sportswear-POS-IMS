'use client';

import {  useId, useRef, useState } from "react";
import { checkPassword, type PasswordDraft, type PasswordErrors } from "@/features/customer/account/validation";
import {focusFirstError} from '../focus-first-error'
import {sectionTitle, label, hint, errorText} from '../reusable/account-reusable';
import { Check, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { changePassword } from "@/features/customer/account/actions";

export function PasswordSection() {
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
                className="press inline-flex h-12 items-center justify-center gap-2 rounded-full bg-action px-6 text-[0.9375rem] font-semibold text-action-ink hover:bg-action-deep disabled:opacity-80"
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