"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRight, LoaderCircle, Ticket as TicketIcon, X } from "lucide-react";
import { formatPeso } from "@/features/shared/catalog/catalog";
import { TICKET_STATE_TEXT, TICKET_DAYS, ticketState, ticketTime, type TicketKind, type TicketState } from "@/features/shared/tickets/model";
import { createTicket, returnTicket } from "@/features/customer/tickets/actions";
import type { TicketSummary } from "@/features/customer/tickets/data";

/** Ready is solid ink, the same as a custom order that's ready; paid is outlined; the rest recede. */
export function TicketPill({ state }: { state: TicketState }) {
  const tone =
    state === "ready"
      ? "bg-ink text-ground"
      : state === "paid"
        ? "text-ink shadow-[inset_0_0_0_1.5px_var(--ink)]"
        : "bg-ground-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]";
  return (
    <span className={`inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-[0.8125rem] font-semibold ${tone}`}>
      {TICKET_STATE_TEXT[state]}
    </span>
  );
}

const shortDay = (iso: string) =>
  new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }).format(new Date(iso));

/** A ticket on the Orders list, ruled like a custom order's row. */
export function TicketRow({ ticket: t, now }: { ticket: TicketSummary; now: number }) {
  const state = ticketState(t, now);
  return (
    <li>
      <Link href={`/orders/tickets/${t.code}`} className="group flex items-center gap-4 py-4 hover:bg-ground-2/60 sm:px-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="tabular text-[0.875rem] font-semibold text-ink-2">{t.code}</span>
            <TicketPill state={state} />
          </div>
          <p className="mt-1.5 truncate text-[1.0625rem] font-semibold text-ink">
            {t.names.slice(0, 2).join(", ")}
            {t.names.length > 2 && ` +${t.names.length - 2}`}
          </p>
          <p className="mt-0.5 text-[0.875rem] text-ink-2">
            {t.kind === "design" ? "Design ticket" : "Counter ticket"}
            {t.team && ` · ${t.team}`} · <span className="tabular">{t.pieces}</span> {t.pieces === 1 ? "piece" : "pieces"} ·{" "}
            <span className="tabular">{formatPeso(t.total)}</span>
          </p>
          <p className="tabular mt-0.5 text-[0.8125rem] text-ink-2">
            Made {shortDay(t.createdAt)}
            {state === "ready" && ` · Good until ${ticketTime(t.expiresAt)}`}
            {state === "paid" && t.closedAt && ` · Paid ${shortDay(t.closedAt)}`}
          </p>
        </div>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink-2 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}

/**
 * Seals one part of the cart into a ticket, then opens it: what's on the rack, or the designs.
 * Orange when it's the cart's only ticket button; ink when ready-made and designs each have one.
 */
export function GetTicketButton({
  kind = "ready",
  disabled,
  folds,
  tone = "action",
}: {
  kind?: TicketKind;
  disabled: boolean;
  folds: string | null;
  tone?: "action" | "ink";
}) {
  const [making, startMaking] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const design = kind === "design";
  const make = () => {
    if (making) return;
    setProblem(null);
    startMaking(async () => {
      const r = await createTicket(kind);
      // Success navigates to the ticket; only a refusal comes back.
      if (r && !r.ok) setProblem(r.message);
    });
  };
  return (
    <div>
      <button
        type="button"
        onClick={make}
        disabled={disabled}
        aria-busy={making || undefined}
        className={`press inline-flex h-14 w-full items-center justify-center gap-2 rounded-full px-6 text-[1rem] font-semibold disabled:bg-ground-2 disabled:text-ink-2 disabled:shadow-[inset_0_0_0_1px_var(--line)] ${
          tone === "action" ? "bg-action text-action-ink hover:bg-action-deep" : "bg-ink text-ground hover:opacity-90 disabled:opacity-100"
        }`}
      >
        {making ? <LoaderCircle aria-hidden="true" className="size-[1.125rem] animate-spin" /> : <TicketIcon aria-hidden="true" className="size-[1.125rem]" />}
        {making ? "Making your ticket…" : design ? "Get my design ticket" : "Get my ticket"}
      </button>
      <div aria-live="polite">
        {problem ? (
          <p className="mt-3 text-[0.9375rem] font-semibold text-ink">{problem}</p>
        ) : (
          <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-2">
            {disabled ? (
              "Nothing here is on the rack right now."
            ) : folds ? (
              <>
                {design ? "Your designs" : "Your items"} move onto one new ticket, together with everything on{" "}
                <span className="tabular whitespace-nowrap font-semibold text-ink">{folds}</span>
                {design ? ", and its team details carry over." : ". Staff scan it at the counter and you pay there."}
              </>
            ) : design ? (
              `Your designs move onto their own ticket. Add your team details there if you like. At the counter you pay at least half down. It’s good for ${TICKET_DAYS} days.`
            ) : (
              `Your items move onto a ticket with a code. Staff scan it at the counter and you pay there. It’s good for ${TICKET_DAYS} days.`
            )}
          </p>
        )}
      </div>
    </div>
  );
}

const outlined =
  "press inline-flex h-12 items-center justify-center rounded-full px-6 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--ink)] hover:bg-ground-2 disabled:opacity-60";

/**
 * What an open ticket can do: go back to the cart to change it, or be cancelled (its items
 * go back to the cart too). An expired one can only go back to the cart.
 */
export function TicketActions({ ticketId, code, expired }: { ticketId: string; code: string; expired: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, startBusy] = useTransition();
  const [doing, setDoing] = useState<"cart" | "stay" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const run = (then: "cart" | "stay") => {
    if (busy) return;
    setProblem(null);
    setDoing(then);
    startBusy(async () => {
      const r = await returnTicket(ticketId, then);
      if (r && !r.ok) setProblem(r.message);
      else dialog.current?.close();
    });
  };
  const close = () => {
    if (!busy) dialog.current?.close();
  };

  return (
    <div>
      <div className="flex flex-col gap-2.5">
        <button type="button" onClick={() => run("cart")} disabled={busy} className={outlined}>
          {busy && doing === "cart" && <LoaderCircle aria-hidden="true" className="mr-2 size-4 animate-spin" />}
          {expired ? "Put items back in my cart" : "Change items in my cart"}
        </button>
        {!expired && (
          <button
            type="button"
            onClick={() => dialog.current?.showModal()}
            disabled={busy}
            className="press inline-flex h-11 items-center justify-center self-center rounded-full px-4 text-[0.9375rem] font-semibold text-ink-2 hover:bg-ground-2 hover:text-ink"
          >
            Cancel ticket
          </button>
        )}
      </div>
      {problem && (
        <p role="alert" className="mt-3 text-[0.9375rem] font-semibold text-ink">
          {problem}
        </p>
      )}

      <dialog
        ref={dialog}
        className="auth-dialog"
        aria-labelledby="cancel-ticket-title"
        onCancel={(e) => busy && e.preventDefault()}
        onClick={(e) => e.target === e.currentTarget && close()}
      >
        <div className="auth-sheet px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-7 sm:pb-7">
          <div className="flex items-start justify-between gap-4">
            <h2 id="cancel-ticket-title" className="voice-display text-[1.875rem]">
              Cancel this ticket?
            </h2>
            <button type="button" onClick={close} className="press -mr-2 -mt-1 grid size-10 place-items-center rounded-full text-ink-2 hover:bg-ground-2 hover:text-ink">
              <X aria-hidden="true" className="size-5" />
              <span className="sr-only">Keep the ticket</span>
            </button>
          </div>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-2">
            <span className="tabular font-semibold text-ink">{code}</span> stops working at the counter. Its items go back to your cart, so
            nothing is lost.
          </p>
          {problem && (
            <p role="alert" className="auth-alert mt-4 rounded-xl px-4 py-3 text-[0.9375rem]">
              {problem}
            </p>
          )}
          <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={close}
              data-autofocus
              className="press inline-flex h-12 items-center justify-center rounded-xl px-5 text-[1rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2"
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={() => run("stay")}
              disabled={busy}
              className="press inline-flex h-12 items-center justify-center rounded-xl bg-ink px-5 text-[1rem] font-semibold text-ground hover:opacity-90 disabled:opacity-70"
            >
              {busy && doing === "stay" ? "Cancelling…" : "Cancel ticket"}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
