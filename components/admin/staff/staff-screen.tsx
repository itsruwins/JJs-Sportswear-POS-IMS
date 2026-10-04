"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, Mail, Phone, Search, UserPlus, X } from "lucide-react";
import { changeRole, searchAccounts } from "@/app/admin/staff/actions";
import { displayName, type Account, type AccountRole, type Member } from "@/lib/admin/staff";

const secondary =
  "press inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3.5 text-[0.875rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2 disabled:opacity-60";
const quiet =
  "press inline-flex h-10 shrink-0 items-center justify-center rounded-full px-3 text-[0.875rem] font-semibold text-ink-2 hover:bg-ground-2 hover:text-ink disabled:opacity-60";
const green =
  "press inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-board px-3.5 text-[0.875rem] font-semibold text-board-ink hover:bg-board-deep disabled:opacity-60";
const confirmBase = "press inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-[0.9375rem] font-semibold disabled:opacity-50";
const confirmTone = {
  ink: `${confirmBase} bg-ink text-ground hover:opacity-90`,
  green: `${confirmBase} bg-board text-board-ink hover:bg-board-deep`,
};

type Change = { account: Account; from: AccountRole; to: AccountRole };
/** A change's outcome, shown in the section where it happened so it's never off-screen. */
type Notice = { id: number; tone: "done" | "problem"; text: string; at: "team" | "add" } | null;

/** The team list, the account search for adding staff, and the confirmation for every role change. */
export function StaffScreen({ members, meId }: { members: Member[]; meId: string }) {
  const router = useRouter();
  const [change, setChange] = useState<Change | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  // Accounts already on the team drop out of earlier search results right away.
  const [promoted, setPromoted] = useState<Set<string>>(new Set());

  const owners = members.filter((m) => m.role === "owner").length;
  const staff = members.length - owners;

  const finish = (result: { ok: boolean; message: string; stale?: boolean }, c: Change) => {
    // Only close the change this result belongs to.
    setChange((cur) => (cur === c ? null : cur));
    setNotice((n) => ({
      id: (n?.id ?? 0) + 1,
      tone: result.ok ? "done" : "problem",
      text: result.message,
      at: c.from === "customer" ? "add" : "team",
    }));
    setPromoted((p) => {
      const next = new Set(p);
      if (c.from === "customer") next.add(c.account.id); // promoted here, or already promoted elsewhere
      if (result.ok && c.to === "customer") next.delete(c.account.id); // a customer again, so findable again
      return next;
    });
    router.refresh();
  };

  return (
    <>
      <section aria-labelledby="team-title" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-b border-line pb-3">
          <h2 id="team-title" className="voice-display text-[1.75rem]">
            Team
          </h2>
          <p className="text-[0.875rem] text-ink-2">
            {owners} {owners === 1 ? "owner" : "owners"} · {staff} staff
          </p>
        </div>
        <NoticeLine notice={notice?.at === "team" ? notice : null} onDismiss={() => setNotice(null)} />
        <ul>
          {members.map((m) => (
            <MemberRow key={m.id} member={m} isMe={m.id === meId} onChange={setChange} />
          ))}
        </ul>
        {staff === 0 && (
          <p className="pt-4 text-[0.9375rem] text-ink-2">No staff yet. Find their account below to add them.</p>
        )}
      </section>

      <AddStaff
        hidden={promoted}
        onPick={(account) => setChange({ account, from: "customer", to: "staff" })}
        notice={<NoticeLine notice={notice?.at === "add" ? notice : null} onDismiss={() => setNotice(null)} />}
      />

      <ConfirmChange change={change} onCancel={() => setChange(null)} onDone={finish} />
    </>
  );
}

/**
 * A change's outcome. The status region is always mounted (so it's announced when text arrives),
 * each outcome is keyed (so a repeat is announced again), and it takes focus, since the button that
 * opened the dialog is often gone once the list updates.
 */
function NoticeLine({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = notice?.id;
  useEffect(() => {
    if (!id) return;
    // A frame later, so the closing dialog's own focus restore has already happened.
    const frame = requestAnimationFrame(() => {
      ref.current?.focus({ preventScroll: true });
      ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [id]);

  return (
    <div role="status" aria-live="polite">
      {notice && (
        <div
          key={notice.id}
          ref={ref}
          tabIndex={-1}
          className={`mt-4 flex scroll-mt-24 scroll-mb-32 items-start justify-between gap-4 rounded-xl px-4 py-3 text-[0.9375rem] outline-none ${
            notice.tone === "problem" ? "auth-alert" : "bg-ground-2 font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)]"
          }`}
        >
          <p>{notice.text}</p>
          <button type="button" onClick={onDismiss} aria-label="Dismiss" className="press -m-1 grid size-7 shrink-0 place-items-center rounded-full text-ink-2 hover:text-ink">
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function Monogram({ account }: { account: Account }) {
  const source = account.name ?? account.username;
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : source.slice(0, 2)).toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="voice-board grid size-11 shrink-0 place-items-center rounded-xl bg-ground-2 text-[1.0625rem] text-ink shadow-[inset_0_0_0_1px_var(--line)]"
    >
      {letters}
    </span>
  );
}

function RolePill({ role }: { role: AccountRole }) {
  if (role === "owner")
    return <span className="inline-flex rounded-full bg-ink px-2.5 py-0.5 text-[0.75rem] font-semibold text-ground">Owner</span>;
  return (
    <span className="inline-flex rounded-full bg-ground-2 px-2.5 py-0.5 text-[0.75rem] font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]">
      Staff
    </span>
  );
}

/** Name, @username, and joined date. */
function Who({ account, isMe = false }: { account: Account; isMe?: boolean }) {
  return (
    <div className="flex min-w-0 items-start gap-3.5">
      <Monogram account={account} />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[1rem] font-semibold leading-snug text-ink">{displayName(account)}</span>
          {account.role !== "customer" && <RolePill role={account.role} />}
          {isMe && <span className="text-[0.8125rem] text-ink-2">You</span>}
        </p>
        <p className="mt-0.5 truncate text-[0.8125rem] text-ink-2">
          {account.name && <>@{account.username} · </>}Joined {account.joined}
        </p>
      </div>
    </div>
  );
}

function Contact({ account }: { account: Account }) {
  if (!account.email && !account.phone) return <p className="text-[0.875rem] text-ink-2">No contact details</p>;
  return (
    <ul className="flex min-w-0 flex-col gap-1 text-[0.875rem]">
      {account.email && (
        <li className="flex min-w-0 items-start gap-2">
          <Mail aria-hidden="true" className="mt-[0.3rem] size-3.5 shrink-0 text-ink-2" />
          <a href={`mailto:${account.email}`} className="min-w-0 text-ink [overflow-wrap:anywhere] hover:underline">
            <span className="sr-only">Email </span>
            {/* A long address breaks after the @, keeping the domain whole. */}
            {account.email.includes("@") ? (
              <>
                {account.email.slice(0, account.email.indexOf("@") + 1)}
                <wbr />
                {account.email.slice(account.email.indexOf("@") + 1)}
              </>
            ) : (
              account.email
            )}
          </a>
        </li>
      )}
      {account.phone && (
        <li className="flex min-w-0 items-start gap-2">
          <Phone aria-hidden="true" className="mt-[0.3rem] size-3.5 shrink-0 text-ink-2" />
          <a href={`tel:${account.phone.replace(/[^\d+]/g, "")}`} className="tabular min-w-0 text-ink [overflow-wrap:anywhere] hover:underline">
            <span className="sr-only">Phone </span>
            {account.phone}
          </a>
        </li>
      )}
    </ul>
  );
}

function MemberRow({ member: m, isMe, onChange }: { member: Member; isMe: boolean; onChange: (c: Change) => void }) {
  return (
    // Phones stack everything; tablets put contact and last change side by side; desktops use one line.
    <li className="grid gap-x-6 gap-y-3 border-b border-line py-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1.15fr)_minmax(0,1fr)_16.5rem] lg:items-center">
      <div className="sm:col-span-2 lg:col-span-1">
        <Who account={m} isMe={isMe} />
      </div>
      <div className="pl-[3.625rem] lg:pl-0">
        <Contact account={m} />
      </div>
      <div className="pl-[3.625rem] text-[0.875rem] sm:pl-0">
        <p className="voice-label text-[0.75rem] text-ink-2">Last stock change</p>
        {m.lastChange ? (
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-3">
            <span className="tabular text-ink">{m.lastChange}</span>
            <Link href={`/admin/history?range=all&staff=${m.id}`} className="inline-flex items-center gap-1 font-semibold text-ink hover:underline">
              History
              <span className="sr-only"> for {displayName(m)}</span>
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </Link>
          </p>
        ) : (
          <p className="mt-0.5 text-ink-2">None yet</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2 pl-[3.625rem] sm:col-span-2 lg:col-span-1 lg:justify-end lg:pl-0">
        {isMe ? (
          <p className="text-[0.8125rem] text-ink-2 lg:text-right">Another owner can change your role.</p>
        ) : m.role === "staff" ? (
          // Removing is the routine change; promoting is rare and high-trust, so it stays quiet.
          <>
            <button type="button" className={secondary} onClick={() => onChange({ account: m, from: "staff", to: "customer" })}>
              Remove from staff<span className="sr-only">: {displayName(m)}</span>
            </button>
            <button type="button" className={quiet} onClick={() => onChange({ account: m, from: "staff", to: "owner" })}>
              Make owner<span className="sr-only">: {displayName(m)}</span>
            </button>
          </>
        ) : (
          <button type="button" className={secondary} onClick={() => onChange({ account: m, from: "owner", to: "staff" })}>
            Change to staff<span className="sr-only">: {displayName(m)}</span>
          </button>
        )}
      </div>
    </li>
  );
}

function AddStaff({ hidden, onPick, notice }: { hidden: Set<string>; onPick: (a: Account) => void; notice: React.ReactNode }) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "done"; q: string; accounts: Account[]; more: boolean }
  >({ kind: "idle" });
  const seq = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Searches a moment after typing stops; a reply to an older query is ignored.
  const search = (value: string) => {
    setQuery(value);
    window.clearTimeout(timer.current);
    const q = value.trim();
    const id = ++seq.current;
    if (q.replace(/^@/, "").length < 2) {
      setState({ kind: "idle" });
      return;
    }
    setState({ kind: "loading" });
    timer.current = window.setTimeout(async () => {
      try {
        const result = await searchAccounts(q);
        if (id !== seq.current) return;
        setState(result.ok ? { kind: "done", q, accounts: result.accounts, more: result.more } : { kind: "error", message: result.message });
      } catch {
        if (id === seq.current) setState({ kind: "error", message: "We couldn’t search accounts just now. Check your connection and try again." });
      }
    }, 250);
  };

  const accounts = state.kind === "done" ? state.accounts.filter((a) => !hidden.has(a.id)) : [];

  return (
    <section aria-labelledby="add-title" className="mt-14">
      <div className="border-b border-line pb-3">
        <h2 id="add-title" className="voice-display text-[1.75rem]">
          Add staff
        </h2>
        <p className="mt-1 max-w-[62ch] text-[0.875rem] text-ink-2">
          New staff first create an account on the shop site, the way customers do. Then find them here.
        </p>
      </div>

      <div className="relative mt-5 w-full sm:max-w-[26rem]">
        <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-[1.125rem] -translate-y-1/2 text-ink-2" />
        <label htmlFor={inputId} className="sr-only">
          Search accounts
        </label>
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="Username, name, email, or phone"
          autoComplete="off"
          spellCheck={false}
          className="auth-input pl-11 pr-11"
        />
        {state.kind === "loading" ? (
          <LoaderCircle aria-label="Searching" className="absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-ink-2" />
        ) : (
          query && (
            <button
              type="button"
              onClick={() => search("")}
              aria-label="Clear search"
              className="press absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-ink-2 hover:text-ink"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          )
        )}
      </div>

      {notice}

      {state.kind === "idle" && (
        <p className="mt-2 py-3 text-[0.875rem] text-ink-2">Type at least two characters. Only customer accounts show up here.</p>
      )}

      {/* Only the short status lines are announced; the results themselves are read when the owner moves into them. */}
      <div role="status" aria-live="polite" className="mt-2">
        {state.kind === "error" && (
          <p className="auth-alert mt-2 max-w-[56ch] rounded-xl px-4 py-3 text-[0.9375rem]">{state.message}</p>
        )}
        {state.kind === "done" && accounts.length === 0 && (
          <p className="max-w-[62ch] py-3 text-[0.9375rem] text-ink-2">
            No customer accounts match “{state.q}”. Check the spelling, or ask them to create an account on the shop site
            first. People already on the team are listed above.
          </p>
        )}
        {accounts.length > 0 && (
          <p className="sr-only">
            {accounts.length} {accounts.length === 1 ? "account" : "accounts"} found
          </p>
        )}
      </div>

      {accounts.length > 0 && (
        <>
          <AccountResults accounts={accounts} onPick={onPick} />
          {state.kind === "done" && state.more && (
            <p className="pt-3 text-[0.875rem] text-ink-2">Showing the first 12. Type more of the name to narrow it down.</p>
          )}
        </>
      )}
    </section>
  );
}

/** Customer accounts found by the search, each with Make staff. */
function AccountResults({ accounts, onPick }: { accounts: Account[]; onPick: (a: Account) => void }) {
  return (
    <ul>
      {accounts.map((a) => (
        <li
          key={a.id}
          className="grid gap-x-6 gap-y-3 border-b border-line py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1.15fr)_minmax(0,1fr)_16.5rem]"
        >
          <Who account={a} />
          <div className="pl-[3.625rem] sm:col-start-1 sm:row-start-2 lg:col-span-2 lg:col-start-auto lg:row-start-auto lg:pl-0">
            <Contact account={a} />
          </div>
          <div className="pl-[3.625rem] sm:row-span-2 sm:pl-0 lg:row-span-1 lg:flex lg:justify-end">
            <button type="button" className={green} onClick={() => onPick(a)}>
              <UserPlus aria-hidden="true" className="size-4" />
              Make staff
              <span className="sr-only">: {displayName(a)}</span>
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

const COPY: Record<string, { title: (who: string) => string; body: string; confirm: string; tone: "green" | "ink" }> = {
  "customer>staff": {
    title: (who) => `Make ${who} staff?`,
    body: "They’ll be able to add and edit products and change stock from their own account. They can’t delete products, see reports, or manage staff.",
    confirm: "Make staff",
    tone: "green",
  },
  "staff>owner": {
    title: (who) => `Make ${who} an owner?`,
    body: "Owners can do everything you can: delete products, see stock value and reports, and add or remove anyone on the team, including you. Only make someone an owner if you’d trust them with the shop.",
    confirm: "Make owner",
    tone: "ink",
  },
  "staff>customer": {
    title: (who) => `Remove ${who} from staff?`,
    body: "Their account goes back to a customer account. They lose admin access the next time they open a page or save something. Everything they changed stays in History under their name.",
    confirm: "Remove from staff",
    tone: "ink",
  },
  "owner>staff": {
    title: (who) => `Change ${who} to staff?`,
    body: "They keep access to products and stock, but can no longer delete products, see reports, or manage staff.",
    confirm: "Change to staff",
    tone: "ink",
  },
};

type Done = (result: { ok: boolean; message: string; stale?: boolean }, c: Change) => void;

/** The confirmation for every role change: a native modal dialog, a bottom sheet on phones. */
function ConfirmChange({ change, onCancel, onDone }: { change: Change | null; onCancel: () => void; onDone: Done }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  // The last change stays rendered after closing, so the sheet animates out instead of emptying first.
  const [shown, setShown] = useState<Change | null>(change);
  const [opened, setOpened] = useState(0);
  if (change && change !== shown) {
    setShown(change);
    setOpened((n) => n + 1); // a fresh form (typed name, error) every time it opens
  }

  // The dialog element is the outside system here: open it for a change, close it when there's none.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (change && !dialog.open) dialog.showModal();
    else if (!change && dialog.open) dialog.close();
  }, [change]);

  return (
    <dialog
      ref={ref}
      className="auth-dialog"
      aria-labelledby="role-title"
      onClose={() => {
        // A repeated Escape can't always be cancelled; while a change is saving, the dialog stays.
        if (busy) ref.current?.showModal();
        else if (change) onCancel();
      }}
      onCancel={(e) => busy && e.preventDefault()}
    >
      {shown && (
        <ConfirmForm key={opened} change={shown} busy={busy} setBusy={setBusy} onCancel={onCancel} onDone={onDone} />
      )}
    </dialog>
  );
}

/** Keyed per opening, so the typed name and any error start fresh each time the dialog opens. */
function ConfirmForm({
  change,
  busy,
  setBusy,
  onCancel,
  onDone,
}: {
  change: Change;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onCancel: () => void;
  onDone: Done;
}) {
  const typedId = useId();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");

  const copy = COPY[`${change.from}>${change.to}`];
  const who = displayName(change.account);
  const needsTyping = change.to === "owner";
  const typedOk = !needsTyping || typed.trim().replace(/^@/, "").toLowerCase() === change.account.username.toLowerCase();

  const confirm = async () => {
    if (busy || !typedOk) return;
    setBusy(true);
    setError("");
    try {
      const result = await changeRole(change.account.id, change.from, change.to, typed);
      setBusy(false);
      // A change made elsewhere in the meantime closes the dialog and shows the latest list.
      if (result.ok || ("stale" in result && result.stale)) onDone(result, change);
      else setError(result.message);
    } catch {
      setBusy(false);
      setError("We couldn’t reach the server. Check your connection and try again.");
    }
  };

  return (
    <form
      className="auth-sheet px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-7 sm:pb-7"
      onSubmit={(e) => {
        e.preventDefault();
        confirm();
      }}
    >
      <h2 id="role-title" className="voice-display text-[1.875rem]">
        {copy.title(who)}
      </h2>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-2">{copy.body}</p>

      {needsTyping && (
        <div className="mt-5">
          <label htmlFor={typedId} className="text-[0.875rem] font-semibold text-ink">
            Type <span className="tabular rounded-md bg-ground-2 px-1.5 py-0.5">{change.account.username}</span> to confirm
          </label>
          <input
            id={typedId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-describedby={`${typedId}-hint`}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="auth-input mt-2"
          />
          <p id={`${typedId}-hint`} className={`mt-1.5 text-[0.8125rem] ${typedOk ? "font-semibold text-ink" : "text-ink-2"}`}>
            {typedOk ? "Matches. You can make them an owner." : "Type it exactly as shown, without the @."}
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="auth-alert mt-4 rounded-xl px-4 py-3 text-[0.9375rem]">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          autoFocus={!needsTyping}
          className="press inline-flex h-11 items-center justify-center rounded-xl px-4 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2 disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !typedOk}
          className={confirmTone[copy.tone]}
        >
          {busy && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
          {copy.confirm}
        </button>
      </div>
    </form>
  );
}
