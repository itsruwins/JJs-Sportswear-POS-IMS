// Loading a customer's counter ticket into the sale: the ticket's lines meet today's rack.
import { formatPeso } from "@/features/shared/catalog/catalog";
import type { LoadedTicket } from "@/features/admin/pos/actions";

export type SaleTicket = { id: string; code: string; customer: string };
type Line = { variantId: string; qty: number };

/**
 * The sale after a ticket is loaded into it (on top of `base`), at most what's on the rack,
 * and a note for every line that didn't come across as the customer saw it: gone from the
 * catalog, sold out, fewer left, or a new price. `added` is 0 when nothing could come across.
 */
export function mergeTicket(
  base: Line[],
  ticket: LoadedTicket,
  rack: (variantId: string) => { stock: number; price: number } | null,
): { cart: Line[]; notes: string[]; added: number } {
  const cart = base.map((l) => ({ ...l }));
  const notes: string[] = [];
  let added = 0;
  for (const t of ticket.lines) {
    const label = [t.name, [t.size, t.color].filter(Boolean).join(" · ")].filter(Boolean).join(", ");
    const now = t.variantId ? rack(t.variantId) : null;
    if (!t.variantId || !now) {
      notes.push(`${label}: no longer sold. Left off.`);
      continue;
    }
    const line = cart.find((l) => l.variantId === t.variantId);
    const room = now.stock - (line?.qty ?? 0);
    if (room <= 0) {
      notes.push(`${label}: sold out. Left off.`);
      continue;
    }
    const qty = Math.min(t.quantity, room);
    if (qty < t.quantity) notes.push(`${label}: only ${qty} of ${t.quantity} on the rack.`);
    if (Math.abs(now.price - t.price) >= 0.005) notes.push(`${label}: now ${formatPeso(now.price)} (the ticket showed ${formatPeso(t.price)}).`);
    if (line) line.qty += qty;
    else cart.push({ variantId: t.variantId, qty });
    added += qty;
  }
  return { cart, notes, added };
}
