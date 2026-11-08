"use client";

import { useEffect, useRef } from "react";
import { Ticket as TicketIcon, X } from "lucide-react";
import type { LoadedTicket } from "@/features/admin/pos/actions";
import type { SaleTicket } from "@/features/admin/pos/ticket";

/**
 * The ticket this sale charges (or this design order takes): its code and customer, and what
 * changed since they made it.
 */
export function TicketChip({
  ticket,
  notes,
  onRemove,
  forOrder = false,
}: {
  ticket: SaleTicket;
  notes: string[];
  onRemove: () => void;
  /** On the Designs tab: the ticket closes when the order is placed, and removing it keeps the order. */
  forOrder?: boolean;
}) {
  const stays = forOrder ? "the order stays" : "the items stay";
  return (
    <div className="mt-3">
      <div className="flex items-center gap-3 rounded-xl bg-ground-2 py-2 pl-3 pr-1 shadow-[inset_0_0_0_1px_var(--line)]">
        <TicketIcon aria-hidden="true" className="size-[1.125rem] shrink-0 text-ink" />
        <p className="min-w-0 flex-1 text-[0.875rem] leading-snug text-ink-2">
          <span className="tabular whitespace-nowrap font-semibold text-ink">{ticket.code}</span>
          <span className="block truncate">
            {ticket.customer}’s ticket · {forOrder ? "closes with the order" : "paid on Charge"}
          </span>
        </p>
        <button
          type="button"
          onClick={onRemove}
          className="press grid size-9 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-ground hover:text-ink"
          aria-label={`Remove ticket ${ticket.code} (${stays})`}
          title={`Remove the ticket; ${stays}`}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      {notes.length > 0 && (
        <ul role="status" className="auth-alert mt-2 space-y-1 rounded-xl px-3 py-2 text-[0.8125rem] leading-snug">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A ticket arrives while the sale already has items: put the ticket's items in their place,
 * or add them. A sale pays one ticket, so a second ticket can only replace the first.
 * On the Designs tab (`forOrder`), a design ticket can only replace the order in progress.
 */
export function TicketChoice({
  ticket,
  current,
  onChoose,
  onClose,
  forOrder = false,
}: {
  ticket: LoadedTicket | null;
  /** The ticket already in the sale (or order), if any. */
  current: SaleTicket | null;
  onChoose: (mode: "replace" | "add") => void;
  onClose: () => void;
  forOrder?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (ticket && !d.open) d.showModal();
    if (!ticket && d.open) d.close();
  }, [ticket]);

  const pieces = ticket?.lines.reduce((s, l) => s + l.quantity, 0) ?? 0;
  const button = "press inline-flex h-12 items-center justify-center whitespace-nowrap rounded-xl px-5 text-[1rem] font-semibold";

  return (
    <dialog
      ref={dialog}
      className="auth-dialog"
      aria-labelledby="ticket-choice-title"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
    >
      {ticket && (
        <div className="auth-sheet px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-7 sm:pb-7">
          <div className="flex items-start justify-between gap-4">
            <h2 id="ticket-choice-title" className="voice-display text-[1.875rem]">
              {forOrder ? "An order is in progress" : "The sale has items"}
            </h2>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="press -mr-2 -mt-1 grid size-10 place-items-center rounded-full text-ink-2 hover:bg-ground-2 hover:text-ink"
            >
              <X aria-hidden="true" className="size-5" />
              <span className="sr-only">{forOrder ? "Keep the order as it is" : "Keep the sale as it is"}</span>
            </button>
          </div>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-2">
            <span className="tabular whitespace-nowrap font-semibold text-ink">{ticket.code}</span> is {ticket.customer}’s ticket,{" "}
            <span className="tabular">{pieces}</span> {pieces === 1 ? "piece" : "pieces"}.{" "}
            {forOrder
              ? current
                ? `This order already takes ${current.code}. An order takes one ticket, so this one replaces it, its pieces, and the buyer.`
                : "Put its designs, sizes, and buyer in place of the order in progress?"
              : current
                ? `This sale already charges ${current.code}. A sale pays one ticket, so this one replaces it and its items.`
                : "Put its items in place of the ones in the sale, or add them to the sale?"}
          </p>
          <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              data-autofocus
              className={`${button} text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2`}
            >
              Cancel
            </button>
            {!current && !forOrder && (
              <button
                type="button"
                onClick={() => onChoose("add")}
                className={`${button} text-ink shadow-[inset_0_0_0_1.5px_var(--ink)] hover:bg-ground-2`}
              >
                Add to sale
              </button>
            )}
            <button type="button" onClick={() => onChoose("replace")} className={`${button} bg-ink text-ground hover:opacity-90`}>
              {current ? `Switch to ${ticket.code}` : forOrder ? "Replace order" : "Replace items"}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
