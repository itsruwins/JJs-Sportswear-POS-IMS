"use client";

import { useId, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/features/shared/auth/components/auth-provider";
import { USERNAME_HINT, USERNAME_PATTERN } from "@/features/shared/auth/credentials";

type UsernameFormProps = {
  tone?: "board" | "ground";
  label?: string;
};

const HINT = USERNAME_HINT;

export function UsernameForm({ tone = "ground", label = "Choose a username" }: UsernameFormProps) {
  const id = useId();
  const { openAuth } = useAuth();
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);

  const invalid = value.length > 0 && !USERNAME_PATTERN.test(value);
  const showError = invalid && touched;
  const onBoard = tone === "board";

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!USERNAME_PATTERN.test(value)) {
          (e.currentTarget.elements.namedItem("username") as HTMLInputElement | null)?.focus();
          return;
        }
        openAuth("signup", value);
      }}
      className="w-full"
    >
      <label
        htmlFor={id}
        className={`voice-label mb-2 block text-[0.8125rem] ${onBoard ? "text-board-ink-2" : "text-ink-2"}`}
      >
        {label}
      </label>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div
          className={`flex h-12 min-w-0 flex-none items-center sm:flex-1 rounded-xl px-4 transition-[box-shadow] duration-200 focus-within:shadow-[0_0_0_2px_var(--focus)] ${
            onBoard
              ? "board-well text-board-ink"
              : "bg-ground-2 text-ink shadow-[inset_0_0_0_1px_var(--line)]"
          } ${showError ? "shadow-[0_0_0_2px_var(--signal)]" : ""}`}
        >
          <span aria-hidden="true" className={onBoard ? "text-board-ink-2" : "text-ink-2"}>
            @
          </span>
          <input
            id={id}
            name="username"
            type="text"
            inputMode="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={30}
            required
            placeholder="mayon.blazers"
            value={value}
            onChange={(e) => setValue(e.target.value.trim())}
            onBlur={() => setTouched(true)}
            aria-invalid={showError}
            aria-describedby={`${id}-hint`}
            className={`ml-0.5 h-full min-w-0 flex-1 bg-transparent text-[1.0625rem] outline-none ${
              onBoard ? "placeholder:text-board-ink-2/70" : "placeholder:text-ink-2/80"
            }`}
          />
        </div>
        <button
          type="submit"
          aria-haspopup="dialog"
          className={`press inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl px-5 text-[1rem] font-semibold ${
            onBoard
              ? "bg-card text-card-ink shadow-[0_1px_0_oklch(1_0_0/0.6)_inset,0_6px_14px_-6px_oklch(0_0_0/0.45)] hover:bg-white"
              : "bg-action text-action-ink hover:bg-action-deep"
          }`}
        >
          Create account
          <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2.25} />
        </button>
      </div>
      <p
        id={`${id}-hint`}
        aria-live="polite"
        className={`mt-2 text-[0.8125rem] ${
          showError
            ? onBoard
              ? "font-semibold text-signal"
              : "font-semibold text-ink"
            : onBoard
              ? "text-board-ink-2"
              : "text-ink-2"
        }`}
      >
        {showError ? `That username won’t work. ${HINT}` : `No email needed. ${HINT}`}
      </p>
    </form>
  );
}
