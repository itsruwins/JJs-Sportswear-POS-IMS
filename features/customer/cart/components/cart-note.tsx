"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

/**
 * What the last tap on Add to cart did, said under the button: what was added and how many are
 * now in the cart, or why it couldn't be. `unit` names what's counted ("of this style").
 */
export type AddNote = { kind: "added"; label: string; quantity: number; unit?: string } | { kind: "problem"; text: string };

/** The answer to the last Add to cart, in place, so shopping carries on from here. */
export function CartNote({ note }: { note: AddNote | null }) {
  return (
    <div id="cart-note" aria-live="polite" className="empty:hidden">
      {note?.kind === "added" ? (
        <div className="cart-note flex items-center gap-3 rounded-2xl bg-ground-2 py-2.5 pl-3.5 pr-2 shadow-[inset_0_0_0_1px_var(--line)]">
          <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-ground">
            <Check className="size-3.5" strokeWidth={3} />
          </span>
          <p className="min-w-0 flex-1 text-[0.9375rem] leading-snug text-ink">
            <span className="font-semibold">Added to cart.</span>{" "}
            <span className="tabular text-ink-2">
              {note.label} · {note.quantity} in your cart{note.unit ? ` ${note.unit}` : ""}
            </span>
          </p>
          <Link
            href="/cart"
            className="press inline-flex h-10 shrink-0 items-center gap-1 rounded-full px-3 text-[0.9375rem] font-semibold text-ink underline underline-offset-4 hover:bg-ground hover:no-underline"
          >
            View cart
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      ) : note?.kind === "problem" ? (
        <p className="cart-note px-1 text-[0.9375rem] font-semibold text-ink">{note.text}</p>
      ) : null}
    </div>
  );
}
