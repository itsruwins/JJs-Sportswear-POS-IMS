"use client";

import { useId, useState, useTransition } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { ROSTER_MAX, TEAM_NAME_MAX } from "@/features/shared/tickets/model";
import { setTicketDetails, type TeamDetails } from "@/features/customer/tickets/actions";

/** Today in Manila as a date input value: a needed-by date can't be earlier. */
const manilaToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/**
 * The optional team details on an open design ticket: team name, when they're needed, and the
 * player names and numbers. Saved on the ticket for the counter, where staff check them.
 */
export function TeamDetailsForm({ ticketId, initial }: { ticketId: string; initial: TeamDetails }) {
  const ids = { team: useId(), date: useId(), roster: useId(), rosterHelp: useId() };
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [saving, startSaving] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [today] = useState(manilaToday);

  const dirty = draft.team.trim() !== saved.team.trim() || draft.neededBy !== saved.neededBy || draft.roster.trim() !== saved.roster.trim();
  const edit = (patch: Partial<TeamDetails>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setJustSaved(false);
    setProblem(null);
  };
  const save = () => {
    if (saving || !dirty) return;
    startSaving(async () => {
      const r = await setTicketDetails(ticketId, draft);
      if (!r.ok) {
        setProblem(r.message);
        return;
      }
      const clean = { team: draft.team.trim(), neededBy: draft.neededBy, roster: draft.roster.trim() };
      setDraft(clean);
      setSaved(clean);
      setJustSaved(true);
    });
  };

  const lines = draft.roster.split("\n").filter((l) => l.trim()).length;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="mt-4 flex flex-col gap-5"
    >
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <div>
          <label htmlFor={ids.team} className="text-[0.9375rem] font-semibold text-ink">
            Team name
          </label>
          <input
            id={ids.team}
            value={draft.team}
            maxLength={TEAM_NAME_MAX}
            onChange={(e) => edit({ team: e.target.value })}
            placeholder="Antipolo Eagles"
            autoComplete="off"
            className="auth-input mt-2 px-4"
          />
        </div>
        <div>
          <label htmlFor={ids.date} className="text-[0.9375rem] font-semibold text-ink">
            Needed by
          </label>
          <input
            id={ids.date}
            type="date"
            value={draft.neededBy}
            min={today}
            onChange={(e) => edit({ neededBy: e.target.value })}
            className="auth-input tabular mt-2 px-4"
          />
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={ids.roster} className="text-[0.9375rem] font-semibold text-ink">
            Names and numbers
          </label>
          {lines > 0 && <span className="tabular text-[0.8125rem] text-ink-2">{lines === 1 ? "1 player" : `${lines} players`}</span>}
        </div>
        <p id={ids.rosterHelp} className="mt-1 text-[0.875rem] text-ink-2">
          One player per line: surname, number, and size.
        </p>
        <textarea
          id={ids.roster}
          aria-describedby={ids.rosterHelp}
          value={draft.roster}
          maxLength={ROSTER_MAX}
          rows={6}
          onChange={(e) => edit({ roster: e.target.value })}
          placeholder={"DELA CRUZ 7 (M)\nSANTOS 23 (L)"}
          className="auth-input mt-2 h-auto min-h-[9rem] resize-y px-4 py-3 leading-relaxed"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="submit"
          disabled={!dirty || saving}
          className="press inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--ink)] hover:bg-ground-2 disabled:text-ink-2 disabled:shadow-[inset_0_0_0_1px_var(--line)] disabled:hover:bg-transparent"
        >
          {saving && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
          {saving ? "Saving…" : "Save team details"}
        </button>
        <p aria-live="polite" className="text-[0.9375rem]">
          {problem ? (
            <span role="alert" className="font-semibold text-ink">
              {problem}
            </span>
          ) : justSaved && !dirty ? (
            <span className="inline-flex items-center gap-1.5 text-ink-2">
              <Check aria-hidden="true" className="size-4 text-ink" strokeWidth={2.5} />
              Saved on the ticket.
            </span>
          ) : null}
        </p>
      </div>
    </form>
  );
}
