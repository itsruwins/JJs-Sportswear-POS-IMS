"use client";

import { useId } from "react";
import { ChevronDown } from "lucide-react";
import { formatName, NAME_PART_MAX, SUFFIXES, type NameParts } from "@/features/shared/names/model";
import type { NameErrors } from "@/features/shared/names/validation";

type Props = {
  value: NameParts;
  errors: NameErrors;
  onChange: (patch: Partial<NameParts>) => void;
  /** Example names in the empty fields (the sign-up form). */
  examples?: boolean;
  /** Focus First name when the form opens. */
  autoFocus?: boolean;
  /** The small signal dot before an error, as the sign-up form's other fields have. */
  errorDot?: boolean;
  /**
   * Someone else's name (a buyer at the counter): no autofill, and the preview speaks to staff
   * ("On the order: …") instead of the customer ("The shop sees: …").
   */
  forSomeoneElse?: boolean;
};

const label = "mb-2 block text-[0.9375rem] font-semibold text-ink";

/**
 * First | Last, then Middle | Suffix, in the auth input, with a live line showing the name the
 * shop sees ("Juan D. Dela Cruz Jr."). The fields keep what's typed; the database tidies it the
 * same way the preview does. Field ids are `<id>-first`, so a form can focus the first problem
 * through `[aria-invalid='true']`.
 */
export function NameFields({ value, errors, onChange, examples, autoFocus, errorDot, forSomeoneElse }: Props) {
  const id = useId();
  // Previewed once both required parts are there, so it never shows half a name.
  const shown = value.firstName.trim() && value.lastName.trim() ? formatName(value) : "";

  const message = (key: keyof NameParts) =>
    errors[key] ? (
      <p id={`${id}-${key}-msg`} className="mt-2 flex gap-2 text-[0.875rem] font-semibold leading-snug text-ink">
        {errorDot && <span aria-hidden="true" className="mt-[0.4em] size-1.5 shrink-0 rounded-full signal-dot" />}
        {errors[key]}
      </p>
    ) : null;

  const text = (key: Exclude<keyof NameParts, "suffix">, autoComplete: string, example: string) => (
    <input
      id={`${id}-${key}`}
      value={value[key]}
      onChange={(e) => onChange({ [key]: e.target.value })}
      maxLength={NAME_PART_MAX}
      autoComplete={forSomeoneElse ? "off" : autoComplete}
      autoCapitalize="words"
      spellCheck={false}
      placeholder={examples ? example : undefined}
      data-autofocus={(autoFocus && key === "firstName") || undefined}
      aria-invalid={Boolean(errors[key]) || undefined}
      aria-describedby={errors[key] ? `${id}-${key}-msg` : `${id}-shown`}
      className={`auth-input min-w-0 px-4 ${errors[key] ? "is-invalid" : ""}`}
    />
  );

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-5">
        <div className="min-w-0">
          <label htmlFor={`${id}-firstName`} className={label}>
            First name
          </label>
          {text("firstName", "given-name", "Juan")}
          {message("firstName")}
        </div>
        <div className="min-w-0">
          <label htmlFor={`${id}-lastName`} className={label}>
            Last name
          </label>
          {text("lastName", "family-name", "Dela Cruz")}
          {message("lastName")}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_7rem] gap-x-3">
        <div className="min-w-0">
          <label htmlFor={`${id}-middleName`} className={label}>
            Middle name <span className="font-normal text-ink-2">(optional)</span>
          </label>
          {text("middleName", "additional-name", "Dizon")}
          {message("middleName")}
        </div>
        <div className="min-w-0">
          <label htmlFor={`${id}-suffix`} className={label}>
            Suffix
          </label>
          <div className="relative">
            <select
              id={`${id}-suffix`}
              value={value.suffix}
              onChange={(e) => onChange({ suffix: e.target.value as NameParts["suffix"] })}
              autoComplete={forSomeoneElse ? "off" : "honorific-suffix"}
              aria-invalid={Boolean(errors.suffix) || undefined}
              aria-describedby={errors.suffix ? `${id}-suffix-msg` : undefined}
              className={`auth-input cursor-pointer appearance-none pl-4 pr-9 ${value.suffix ? "" : "text-ink-2"} ${errors.suffix ? "is-invalid" : ""}`}
            >
              <option value="">None</option>
              {SUFFIXES.map((s) => (
                <option key={s} value={s} className="text-ink">
                  {s}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-2" />
          </div>
          {message("suffix")}
        </div>
      </div>

      <p id={`${id}-shown`} className="mt-3 text-[0.875rem] leading-snug text-ink-2">
        {shown ? (
          <>
            {forSomeoneElse ? "On the order:" : "The shop sees:"} <span className="font-semibold text-ink">{shown}</span>
          </>
        ) : forSomeoneElse ? (
          "The middle name shows as an initial."
        ) : (
          "Your middle name shows as an initial."
        )}
      </p>
    </div>
  );
}
