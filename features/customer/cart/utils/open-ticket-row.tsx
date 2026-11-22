import { ArrowRight } from "lucide-react";
import Link from "next/link";
import {
    piecesLabel,
    type CartLine,
  } from "@/features/customer/cart/model";
import type { TicketSummary } from "@/features/customer/tickets/data";

/** A ticket already made: where to find it, and what a new one of its kind does with it. */
export function OpenTicketRow({ ticket: t, taken }: { ticket: TicketSummary; taken: boolean }) {
  const design = t.kind === "design";
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl bg-ground-2 py-3 pl-4 pr-2 shadow-[inset_0_0_0_1px_var(--line)]">
      <p className="min-w-0 text-[0.9375rem] leading-snug text-ink">
        <span className="font-semibold">
          {design ? "Design ticket" : "Ticket"} <span className="tabular whitespace-nowrap">{t.code}</span> is ready for the counter
        </span>
        <span className="text-ink-2">
          {" "}
          · <span className="tabular">{piecesLabel(t.pieces)}</span>
          {taken ? `. A new ${design ? "design ticket takes its designs" : "ticket takes its items"} in.` : "."}
        </span>
      </p>
      <Link
        href={`/orders/tickets/${t.code}`}
        className="press inline-flex h-10 shrink-0 items-center gap-1 rounded-full px-3 text-[0.9375rem] font-semibold text-ink underline underline-offset-4 hover:bg-ground hover:no-underline"
      >
        View ticket
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </div>
  );
}