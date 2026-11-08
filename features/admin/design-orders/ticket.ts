// Loading a customer's design ticket into a counter order: the ticket's sizes meet today's designs.
import { formatPeso } from "@/features/shared/catalog/catalog";
import type { LoadedTicket } from "@/features/admin/pos/actions";
import { MAX_PIECES, manilaDate, type Buyer, type Design, type Pieces } from "./model";

/**
 * The order a design ticket fills in: its pieces (only sizes still offered), the designs in the
 * order the ticket lists them, and the buyer from the customer's account and team details.
 * A note for each line that didn't come across as the customer saw it (gone, or a new price),
 * and for a needed-by date that has passed. `added` is 0 when nothing could come across.
 */
export function orderFromTicket(
  ticket: LoadedTicket,
  designs: Design[],
  today = manilaDate(),
): { pieces: Pieces; designOrder: string[]; buyer: Buyer; notes: string[]; added: number } {
  const offered = new Map<string, { designId: string; price: number }>();
  for (const d of designs) for (const st of d.styles) for (const v of st.variants) offered.set(v.id, { designId: d.id, price: v.price });

  const pieces: Pieces = {};
  const designOrder: string[] = [];
  const notes: string[] = [];
  let added = 0;
  for (const l of ticket.lines) {
    const label = [l.name, [l.color, l.size].filter(Boolean).join(" · ")].filter(Boolean).join(", ");
    const now = l.variantId ? offered.get(l.variantId) : undefined;
    if (!l.variantId || !now) {
      notes.push(`${label}: no longer offered. Left off.`);
      continue;
    }
    const qty = Math.min(MAX_PIECES - (pieces[l.variantId] ?? 0), l.quantity);
    if (qty <= 0) continue;
    pieces[l.variantId] = (pieces[l.variantId] ?? 0) + qty;
    if (!designOrder.includes(now.designId)) designOrder.push(now.designId);
    if (Math.abs(now.price - l.price) >= 0.005) notes.push(`${label}: now ${formatPeso(now.price)} (the ticket showed ${formatPeso(l.price)}).`);
    added += qty;
  }

  const d = ticket.design;
  const neededBy = d?.neededBy && d.neededBy >= today ? d.neededBy : "";
  if (d?.neededBy && !neededBy) notes.push("The needed-by date on the ticket has passed. Ask for a new one.");
  const buyer: Buyer = { name: d?.name ?? "", phone: d?.phone ?? "", team: d?.team ?? "", neededBy, notes: d?.roster ?? "" };
  return { pieces, designOrder, buyer, notes, added };
}
