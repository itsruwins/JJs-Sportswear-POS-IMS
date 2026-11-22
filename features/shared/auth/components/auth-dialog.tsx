"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ChevronDown, Eye, EyeOff, LoaderCircle, X } from "lucide-react";
import { CUSTOMER_HOME } from "@/lib/paths";
import { createClient } from "@/lib/supabase/client";
import {
  PASSWORD_MIN,
  USERNAME_HINT,
  USERNAME_PATTERN,
  describeLogInError,
  describeSignUpError,
  usernameToEmail,
  type AuthFailure,
} from "@/features/shared/auth/credentials";
import { FlipText } from "@/features/shared/ui/flip-text";
import { NameFields } from "@/features/shared/names/components/name-fields";
import { blankName, formatName, nameToRow, type NameParts } from "@/features/shared/names/model";
import { checkName, type NameErrors } from "@/features/shared/names/validation";

export type AuthMode = "signup" | "login";

type AuthDialogProps = {
  open: boolean;
  mode: AuthMode;
  prefill: string;
  nonce: number;
  username: string | null;
  isStaff: boolean;
  onSignedIn: (username: string, userId: string) => void;
  onSignOut: () => Promise<void>;
  onClose: () => void;
};

const PHONE_SHEET = "(max-width: 639px)";

// Apple's momentum projection: where a flick would come to rest.
function project(velocity: number, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

export function AuthDialog({ open, mode, prefill, nonce, username, isStaff, onSignedIn, onSignOut, onClose }: AuthDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, nonce]);

  // Phones: drag the sheet's header down to dismiss. Tracks 1:1, projects the flick,
  // and either springs back or leaves along the same path it arrived.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const phone = window.matchMedia(PHONE_SHEET);
    let pointerId = -1;
    let startY = 0;
    let dy = 0;
    let samples: { y: number; t: number }[] = [];

    const onDown = (e: PointerEvent) => {
      if (!phone.matches || e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (!target.closest("[data-drag-handle]") || target.closest("button, a, input, label")) return;
      pointerId = e.pointerId;
      startY = e.clientY;
      dy = 0;
      samples = [{ y: e.clientY, t: e.timeStamp }];
      dialog.setPointerCapture(e.pointerId);
      dialog.style.transition = "none";
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const raw = e.clientY - startY;
      dy = raw >= 0 ? raw : rubberband(raw, dialog.offsetHeight);
      dialog.style.transform = `translateY(${dy}px)`;
      samples.push({ y: e.clientY, t: e.timeStamp });
      if (samples.length > 5) samples.shift();
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      pointerId = -1;
      const first = samples[0];
      const last = samples[samples.length - 1];
      const velocity = ((last.y - first.y) / Math.max(1, last.t - first.t)) * 1000;
      const dismiss = e.type === "pointerup" && dy + project(velocity) > dialog.offsetHeight * 0.4;
      // Hand back to CSS: the transition starts from the sheet's current position.
      dialog.style.transition = "";
      dialog.style.transform = "";
      if (dismiss) dialog.close();
    };

    dialog.addEventListener("pointerdown", onDown);
    dialog.addEventListener("pointermove", onMove);
    dialog.addEventListener("pointerup", onUp);
    dialog.addEventListener("pointercancel", onUp);
    return () => {
      dialog.removeEventListener("pointerdown", onDown);
      dialog.removeEventListener("pointermove", onMove);
      dialog.removeEventListener("pointerup", onUp);
      dialog.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="auth-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onPointerDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        // Close only on a click that both started and ended on the backdrop.
        if (e.target === e.currentTarget && pressedOnBackdrop.current) ref.current?.close();
      }}
    >
      <div className="auth-sheet overflow-x-hidden overflow-y-auto no-scrollbar">
        <AuthPanel
          key={nonce}
          initialMode={mode}
          prefill={prefill}
          titleId={titleId}
          signedInAs={username}
          isStaff={isStaff}
          onSignedIn={onSignedIn}
          onSignOut={onSignOut}
          onDone={() => ref.current?.close()}
        />
      </div>
    </dialog>
  );
}

type PanelProps = {
  initialMode: AuthMode;
  prefill: string;
  titleId: string;
  signedInAs: string | null;
  isStaff: boolean;
  onSignedIn: (username: string, userId: string) => void;
  onSignOut: () => Promise<void>;
  onDone: () => void;
};

type Errors = NameErrors & Partial<Record<"username" | "password" | "email" | "form", string>>;

const COPY = {
  signup: {
    title: "Claim your board.",
    sub: "Pick a username and password. Your custom orders, payments, and chats with the shop live here.",
    submit: "Create account",
    pending: "Creating account…",
  },
  login: {
    title: "Back on the board.",
    sub: "Log in with the username you signed up with.",
    submit: "Log in",
    pending: "Logging in…",
  },
} as const;

function AuthPanel({ initialMode, prefill, titleId, signedInAs, isStaff, onSignedIn, onSignOut, onDone }: PanelProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [view, setView] = useState<"form" | "done">(signedInAs ? "done" : "form");
  const [who, setWho] = useState(signedInAs ?? "");

  const [username, setUsername] = useState(prefill);
  const [name, setName] = useState<NameParts>(blankName);
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);

  const ids = { username: useId(), password: useId(), phone: useId(), email: useId(), form: useId() };
  const prefillValid = USERNAME_PATTERN.test(prefill);
  const copy = COPY[mode];

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setErrors({});
  };

  const validate = (): Errors => {
    const next: Errors = {};
    if (!USERNAME_PATTERN.test(username)) next.username = `Use ${USERNAME_HINT.toLowerCase()}`;
    if (mode === "signup") Object.assign(next, checkName(name));
    if (mode === "signup" && password.length < PASSWORD_MIN) {
      next.password = `Use at least ${PASSWORD_MIN} characters.`;
    }
    if (mode === "login" && !password) next.password = "Enter your password.";
    if (mode === "signup" && email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      next.email = "That email doesn’t look complete. Leave it empty if you’d rather not add one.";
    }
    return next;
  };

  const applyFailure = (failure: AuthFailure) => setErrors({ [failure.field]: failure.message });

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      // The first flagged field in the form's order.
      requestAnimationFrame(() => form.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }

    setPending(true);
    const supabase = createClient();
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: usernameToEmail(username),
          password,
          options: {
            data: {
              username,
              ...nameToRow(name),
              // For a database that hasn't had the name-parts update yet; ignored once it has.
              full_name: formatName(name),
              phone: phone.trim() || null,
              email: email.trim() || null,
            },
          },
        });
        if (error) return applyFailure(describeSignUpError(error));
        if (!data.session) {
          return setErrors({
            form: "Your account was created, but it can’t sign in yet. Message the shop and they’ll activate it.",
          });
        }
        setWho(username);
        onSignedIn(username, data.session.user.id);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: usernameToEmail(username),
          password,
        });
        if (error) return applyFailure(describeLogInError(error));
        const actual = typeof data.user.user_metadata?.username === "string" ? data.user.user_metadata.username : username;
        setWho(actual);
        onSignedIn(actual, data.user.id);
      }
      setPassword("");
      setView("done");
    } catch (err) {
      applyFailure(describeLogInError(err as { message?: string }));
    } finally {
      setPending(false);
    }
  };

  if (view === "done") {
    return (
      <>
        <SheetHeader titleId={titleId} title="You’re on the board." sub={`Signed in as @${who}.`} onDone={onDone} />
        <div className="px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-7 sm:pb-7">
          <WelcomeBoard />
          <p className="mt-5 text-[0.9375rem] leading-relaxed text-ink-2">
            {isStaff
              ? "Your staff tools are in the admin."
              : "Your custom orders, payments, and messages with the shop will all be under this account."}
          </p>
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row-reverse">
            <a
              href={isStaff ? "/admin" : CUSTOMER_HOME}
              data-autofocus
              className="press inline-flex h-12 flex-1 items-center justify-center rounded-xl bg-action px-5 text-[1rem] font-semibold text-action-ink hover:bg-action-deep"
            >
              {isStaff ? "Open admin" : "Open the shop"}
            </a>
            <button
              type="button"
              onClick={async () => {
                await onSignOut();
                setWho("");
                setView("form");
                setMode("login");
              }}
              className="press inline-flex h-12 items-center justify-center rounded-xl px-5 text-[1rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2"
            >
              Log out
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SheetHeader
        titleId={titleId}
        title={copy.title}
        sub={copy.sub}
        onDone={onDone}
        switcher={
          <div role="group" aria-label="Account" className="board-well flex rounded-full p-1">
            {(["signup", "login"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => switchMode(m)}
                className={`press rounded-full px-3.5 py-1.5 text-[0.875rem] font-semibold whitespace-nowrap ${
                  mode === m ? "bg-card text-card-ink shadow-[0_1px_3px_oklch(0_0_0/0.3)]" : "text-board-ink-2 hover:text-board-ink"
                }`}
              >
                {m === "signup" ? "Create account" : "Log in"}
              </button>
            ))}
          </div>
        }
      />

      <form
        noValidate
        onSubmit={submit}
        aria-busy={pending}
        aria-describedby={errors.form ? ids.form : undefined}
        className="flex flex-col gap-5 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-7 sm:pb-7"
      >
        <Field id={ids.username} label="Username" error={errors.username} hint={mode === "signup" ? USERNAME_HINT : undefined}>
          <div className={`auth-input flex items-center ${errors.username ? "is-invalid" : ""}`}>
            <span aria-hidden="true" className="pl-4 text-ink-2">
              @
            </span>
            <input
              id={ids.username}
              data-autofocus={!(mode === "signup" && prefillValid) || undefined}
              value={username}
              onChange={(e) => setUsername(e.target.value.trim())}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={30}
              placeholder="mayon.blazers"
              aria-invalid={!!errors.username}
              aria-describedby={`${ids.username}-msg`}
              className="h-full min-w-0 flex-1 bg-transparent pl-0.5 pr-4 outline-none"
            />
          </div>
        </Field>

        {mode === "signup" && (
          <NameFields
            value={name}
            errors={errors}
            onChange={(patch) => {
              setName((n) => ({ ...n, ...patch }));
              const key = Object.keys(patch)[0] as keyof NameParts;
              if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
            }}
            examples
            autoFocus={prefillValid}
            errorDot
          />
        )}

        <Field
          id={ids.password}
          label="Password"
          error={errors.password}
          hint={mode === "signup" ? `At least ${PASSWORD_MIN} characters.` : undefined}
        >
          <div className={`auth-input flex items-center ${errors.password ? "is-invalid" : ""}`}>
            <input
              id={ids.password}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              aria-invalid={!!errors.password}
              aria-describedby={`${ids.password}-msg`}
              className="h-full min-w-0 flex-1 bg-transparent pl-4 outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="press mr-1.5 grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-line/50 hover:text-ink"
            >
              {showPassword ? <EyeOff className="size-[1.1rem]" aria-hidden="true" /> : <Eye className="size-[1.1rem]" aria-hidden="true" />}
            </button>
          </div>
        </Field>

        {mode === "signup" && (
          <div>
            <button
              type="button"
              onClick={() => setShowContact((v) => !v)}
              aria-expanded={showContact}
              className="press inline-flex items-center gap-1.5 rounded-lg py-1 text-[0.9375rem] font-semibold text-ink"
            >
              Add phone and email
              <span className="font-normal text-ink-2">(optional)</span>
              <ChevronDown
                aria-hidden="true"
                className={`size-4 text-ink-2 transition-transform duration-200 ${showContact ? "rotate-180" : ""}`}
              />
            </button>
            {showContact && (
              <div className="mt-4 flex flex-col gap-5">
                <Field id={ids.phone} label="Phone">
                  <input
                    id={ids.phone}
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel"
                    maxLength={20}
                    placeholder="0917 123 4567"
                    aria-describedby={`${ids.phone}-msg`}
                    className="auth-input px-4"
                  />
                </Field>
                <Field
                  id={ids.email}
                  label="Email"
                  error={errors.email}
                  hint="Only for reaching you or recovering your account. You log in with your username."
                >
                  <input
                    id={ids.email}
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    aria-invalid={!!errors.email}
                    aria-describedby={`${ids.email}-msg`}
                    className={`auth-input px-4 ${errors.email ? "is-invalid" : ""}`}
                  />
                </Field>
              </div>
            )}
          </div>
        )}

        {errors.form && (
          <p id={ids.form} role="alert" className="auth-alert rounded-xl px-4 py-3 text-[0.9375rem] leading-snug">
            {errors.form}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="press inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-action px-5 text-[1rem] font-semibold text-action-ink hover:bg-action-deep disabled:cursor-progress disabled:opacity-80"
        >
          {pending && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
          {pending ? copy.pending : copy.submit}
        </button>

        <p className="text-center text-[0.9375rem] text-ink-2">
          {mode === "signup" ? (
            <>
              Already have an account?{" "}
              <button type="button" onClick={() => switchMode("login")} className="font-semibold text-ink underline">
                Log in
              </button>
            </>
          ) : (
            <>
              New here?{" "}
              <button type="button" onClick={() => switchMode("signup")} className="font-semibold text-ink underline">
                Create an account
              </button>
              <span className="mt-2 block text-[0.875rem]">Forgot your password? Message the shop and staff will help you reset it.</span>
            </>
          )}
        </p>
      </form>
    </>
  );
}

function SheetHeader({
  titleId,
  title,
  sub,
  switcher,
  onDone,
}: {
  titleId: string;
  title: string;
  sub: string;
  switcher?: React.ReactNode;
  onDone: () => void;
}) {
  return (
    <header data-drag-handle className="auth-head relative px-5 pb-6 pt-2 text-board-ink sm:rounded-none sm:px-7 sm:pb-7 sm:pt-5">
      <span aria-hidden="true" className="mx-auto mb-3 block h-1.5 w-10 rounded-full bg-board-ink/35 sm:hidden" />
      <div className="flex min-h-10 items-center justify-between gap-3">
        {switcher ?? <span />}
        <button
          type="button"
          onClick={onDone}
          aria-label="Close"
          className="press grid size-10 shrink-0 place-items-center rounded-full text-board-ink-2 hover:bg-board-deep hover:text-board-ink"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>
      <h2 id={titleId} className="voice-display mt-5 text-[2.25rem] sm:text-[2.5rem]">
        {title}
      </h2>
      <p className="mt-2 max-w-[40ch] text-[0.9375rem] leading-relaxed text-board-ink-2">{sub}</p>
    </header>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[0.9375rem] font-semibold text-ink">
        {label}
      </label>
      {children}
      {(error || hint) && (
        <p
          id={`${id}-msg`}
          className={`mt-2 flex gap-2 text-[0.875rem] leading-snug ${error ? "font-semibold text-ink" : "text-ink-2"}`}
        >
          {error && <span aria-hidden="true" className="mt-[0.4em] size-1.5 shrink-0 rounded-full signal-dot" />}
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

/** The success state flips in on the same cards as the scoreboard. */
function WelcomeBoard() {
  const [word, setWord] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setWord("YOU'RE IN"), 120);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className="board-well rounded-2xl px-2 py-4 text-center">
      <FlipText text={word} length={9} align="center" label="You're in" className="text-[min(9vw,2.6rem)]" />
    </div>
  );
}
