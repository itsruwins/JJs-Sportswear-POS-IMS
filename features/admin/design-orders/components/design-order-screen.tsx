"use client";

import { uuid } from "@/lib/uuid";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, LoaderCircle, ScanLine, Search, Ticket as TicketIcon, X } from "lucide-react";
import { FlipText } from "@/features/shared/ui/flip-text";
import { formatPeso } from "@/features/shared/catalog/catalog";
import type { PaymentProvider } from "@/features/shared/payments/model";
import { parseAmount, roundPeso } from "@/features/admin/pos/amounts";
import type { EPayment } from "@/features/admin/pos/scan";
import { PosPayments } from "@/features/admin/pos/components/pos-payments";
import { PosScanSheet, type ReceiptPhoto, type ScanSession } from "@/features/admin/pos/components/pos-scan-sheet";
import { loadTicket, type LoadedTicket } from "@/features/admin/pos/actions";
import type { SaleTicket } from "@/features/admin/pos/ticket";
import { TicketChip, TicketChoice } from "@/features/admin/pos/components/pos-ticket";
import { TicketScanSheet } from "@/features/admin/pos/components/pos-ticket-scan";
import { normalizeTicketCode } from "@/features/shared/tickets/model";
import { orderFromTicket } from "@/features/admin/design-orders/ticket";
import { placeCounterOrder, type CounterPayment, type PlaceField } from "@/features/admin/design-orders/actions";
import {
  blankBuyer,
  downPayment,
  manilaDate,
  orderLines,
  phoneOk,
  piecesOf,
  totalOf,
  type Buyer,
  type Design,
  type Pieces,
} from "@/features/admin/design-orders/model";
import { DesignPhoto, DesignTile, OrderSummary, PiecesEditor, StepStrip, type Step } from "./design-order-parts";

const STORE = "jj-pos-design-order";
type View = "designs" | "design" | Step;
type Saved = {
  pieces: Pieces;
  designOrder: string[];
  buyer: Buyer;
  amount: string;
  cashOn: boolean;
  cash: string;
  ePayments: EPayment[];
  key: string;
  ticket?: SaleTicket | null;
  ticketNotes?: string[];
};

const primary =
  "press inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-action px-5 text-[1.0625rem] font-semibold text-action-ink hover:bg-action-deep disabled:opacity-50";
const outlined =
  "press inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-[1.0625rem] font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--line)] hover:bg-ground-2";
const back = "press inline-flex items-center gap-1.5 self-start py-1 text-[0.9375rem] font-semibold text-ink hover:underline";
const outline =
  "press inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2";

function matches(d: Design, tokens: string[]) {
  const text = [d.name, d.number !== null ? `design ${d.number} d${d.number}` : "", ...d.tags].join(" \u0000 ").toLowerCase();
  return tokens.every((t) => text.includes(t) || (d.number !== null && t === String(d.number)));
}

/**
 * Design orders at the counter: pick designs and their pieces, take the buyer's details, then take
 * at least half down (cash, e-payment, or both) and place the order. Everything stays in this tab
 * (sessionStorage) until it's placed, so a refresh or a detour to Shelf loses nothing.
 * A customer's design ticket (typed, scanned, or handed over from Shelf) fills the order in;
 * placing it closes the ticket in the same step.
 */
export function DesignOrderScreen({
  designs,
  providers,
  reader,
  isOwner,
  initialTicket = null,
}: {
  designs: Design[];
  providers: PaymentProvider[];
  reader: boolean;
  isOwner: boolean;
  /** A design ticket code handed over from the Shelf tab, loaded once the page is up. */
  initialTicket?: string | null;
}) {
  const router = useRouter();
  const ids = { search: useId(), name: useId(), phone: useId(), team: useId(), needed: useId(), notes: useId(), amount: useId() };
  const [view, setView] = useState<View>("designs");
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pieces, setPieces] = useState<Pieces>({});
  const [designOrder, setDesignOrder] = useState<string[]>([]);
  const [buyer, setBuyer] = useState<Buyer>(blankBuyer);
  const [amount, setAmount] = useState("");
  const [cashOn, setCashOn] = useState(true);
  const [cash, setCash] = useState("");
  const [ePayments, setEPayments] = useState<EPayment[]>([]);
  const [photos, setPhotos] = useState<Record<string, ReceiptPhoto>>({});
  const [session, setSession] = useState<ScanSession | null>(null);
  const [key, setKey] = useState(() => uuid());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; field?: PlaceField; ticket?: boolean } | null>(null);
  const [touched, setTouched] = useState(false);
  const [restored, setRestored] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // A customer's design ticket: the one this order takes, what changed since they made it,
  // one waiting on "replace?", the lookup in flight, and the camera sheet.
  const [ticket, setTicket] = useState<SaleTicket | null>(null);
  const [ticketNotes, setTicketNotes] = useState<string[]>([]);
  const [pending, setPending] = useState<LoadedTicket | null>(null);
  const [looking, setLooking] = useState<string | null>(null);
  const [ticketMsg, setTicketMsg] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  // Bring back an order in progress from this tab.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORE) ?? "null") as Saved | null;
      if (saved?.key) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of this tab's saved order, after hydration
        setPieces(saved.pieces ?? {});
        setDesignOrder(saved.designOrder ?? []);
        setBuyer({ ...blankBuyer(), ...saved.buyer });
        setAmount(saved.amount ?? "");
        setCashOn(saved.cashOn ?? true);
        setCash(saved.cash ?? "");
        setEPayments(saved.ePayments ?? []);
        setKey(saved.key);
        setTicket(saved.ticket ?? null);
        setTicketNotes(saved.ticketNotes ?? []);
      }
    } catch {}
    setRestored(true);
  }, []);

  const lines = useMemo(() => orderLines(designs, pieces, designOrder), [designs, pieces, designOrder]);
  const total = totalOf(lines);
  const count = piecesOf(lines);
  const half = downPayment(total);

  useEffect(() => {
    if (!restored) return;
    try {
      if (count || buyer.name || buyer.phone || ticket) {
        sessionStorage.setItem(
          STORE,
          JSON.stringify({ pieces, designOrder, buyer, amount, cashOn, cash, ePayments, key, ticket, ticketNotes } satisfies Saved),
        );
      } else sessionStorage.removeItem(STORE);
    } catch {}
  }, [restored, pieces, designOrder, buyer, amount, cashOn, cash, ePayments, key, count, ticket, ticketNotes]);

  const go = (v: View, design?: string) => {
    if (design) setOpenId(design);
    setView(v);
    setError(null);
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
  };

  const setQty = (variantId: string, designId: string, qty: number) => {
    setPieces((p) => {
      const next = { ...p };
      if (qty > 0) next[variantId] = qty;
      else delete next[variantId];
      return next;
    });
    setDesignOrder((o) => (qty > 0 && !o.includes(designId) ? [...o, designId] : o));
  };
  const removeDesign = (designId: string) => {
    const d = designs.find((x) => x.id === designId);
    const vids = new Set(d?.styles.flatMap((s) => s.variants.map((v) => v.id)) ?? []);
    setPieces((p) => Object.fromEntries(Object.entries(p).filter(([v]) => !vids.has(v))));
    setDesignOrder((o) => o.filter((x) => x !== designId));
  };
  const dropPhoto = (id: string) =>
    setPhotos((all) => {
      if (all[id]) URL.revokeObjectURL(all[id].url);
      const rest = { ...all };
      delete rest[id];
      return rest;
    });
  // A fresh order: nothing in it, no payment, a new key. With `next`, it's filled in from that ticket.
  const reset = (next?: { pieces: Pieces; designOrder: string[]; buyer: Buyer }) => {
    setPieces(next?.pieces ?? {});
    setDesignOrder(next?.designOrder ?? []);
    setBuyer(next?.buyer ?? blankBuyer());
    setAmount("");
    setCash("");
    setCashOn(true);
    for (const p of ePayments) dropPhoto(p.id);
    setEPayments([]);
    setKey(uuid());
    setTouched(false);
    setTicket(null);
    setTicketNotes([]);
  };
  const startOver = () => {
    reset();
    setTicketMsg(null);
    go("designs");
  };

  // The order takes a ticket only while it's attached; removing it keeps the order as it is.
  const dropTicket = () => {
    setTicket(null);
    setTicketNotes([]);
    setError((e) => (e?.ticket ? null : e));
  };

  // A looked-up design ticket fills the order in, in place of what was there.
  const applyTicket = (t: LoadedTicket) => {
    setPending(null);
    const next = orderFromTicket(t, designs);
    if (!next.added) {
      setTicketMsg(`None of the designs on ${t.code} are offered anymore. ${next.notes.join(" ")} Take the order with ${t.customer} from the designs here.`);
      return;
    }
    reset(next);
    setTicket({ id: t.id, code: t.code, customer: t.customer });
    setTicketNotes(next.notes);
    setTicketMsg(null);
    setQuery("");
    go("buyer");
  };

  const findTicket = async (code: string) => {
    if (looking) return;
    setScanning(false);
    setTicketMsg(null);
    if (ticket?.code === code) {
      setQuery("");
      go("buyer");
      return;
    }
    setLooking(code);
    try {
      const r = await loadTicket(code);
      if (!r.ok) setTicketMsg(r.message);
      // A ready-made ticket is charged as a sale: the Shelf tab loads it.
      else if (r.ticket.kind === "ready") router.push(`/admin/pos?ticket=${r.ticket.code}`);
      else if (count || buyer.name.trim() || buyer.phone.trim() || ticket) setPending(r.ticket);
      else applyTicket(r.ticket);
    } catch {
      setTicketMsg("We couldn’t look up the ticket. Check the connection and try again.");
    } finally {
      setLooking(null);
    }
  };

  // A code handed over from the Shelf tab: load it once the saved order is back, then drop it from the address.
  const handedOver = useRef(false);
  useEffect(() => {
    if (!restored || !initialTicket || handedOver.current) return;
    handedOver.current = true;
    router.replace("/admin/pos?tab=designs", { scroll: false });
    findTicket(initialTicket);
    // Once: findTicket reads this render's order, which is the restored one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, initialTicket]);

  // Money: what's paid now is at least half, at most the total. E-payments count first; cash makes up the rest.
  const typed = amount.trim() ? parseAmount(amount) : half;
  const epay = roundPeso(ePayments.reduce((s, p) => s + p.amount, 0));
  const payingNow = roundPeso(Math.max(typed, epay));
  const cashPart = roundPeso(Math.max(0, payingNow - epay));
  const received = cashOn ? parseAmount(cash) : 0;
  const balance = roundPeso(total - payingNow);
  const dueFor = (editing: string | null) => roundPeso(payingNow - ePayments.filter((p) => p.id !== editing).reduce((s, p) => s + p.amount, 0));

  const buyerProblems = {
    name: buyer.name.trim().length < 2 ? "Enter the buyer’s name." : "",
    phone: !phoneOk(buyer.phone) ? "Enter a phone number, like 0917 123 4567." : "",
    neededBy: buyer.neededBy && buyer.neededBy < manilaDate() ? "Pick today or a later date." : "",
  };
  const buyerOk = !buyerProblems.name && !buyerProblems.phone && !buyerProblems.neededBy;

  const payProblem = (() => {
    if (payingNow < half) return `Take at least ${formatPeso(half)}, half the total.`;
    if (payingNow > total) return `That’s more than the ${formatPeso(total)} total.`;
    if (cashPart <= 0) return "";
    if (!cashOn) return ePayments.length ? `Still ${formatPeso(cashPart)} to take.` : "Add the e-payment, or switch to cash.";
    if (received < cashPart) return received > 0 ? `Short by ${formatPeso(roundPeso(cashPart - received))} in cash.` : `Enter the cash received (${formatPeso(cashPart)}).`;
    return "";
  })();
  const canPlace = count > 0 && buyerOk && !payProblem && !busy;

  const place = async () => {
    if (!canPlace) return;
    setBusy(true);
    setError(null);
    const payments: CounterPayment[] = [
      ...ePayments.map((p) => ({ method: "e_payment" as const, amount: p.amount, provider: p.provider, reference: p.reference, scanId: p.scanId ?? null })),
      ...(cashPart > 0 ? [{ method: "cash" as const, amount: cashPart }] : []),
    ];
    try {
      const result = await placeCounterOrder({
        items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        buyer: { name: buyer.name, phone: buyer.phone },
        details: { team: buyer.team, neededBy: buyer.neededBy, notes: buyer.notes },
        payments,
        requestId: key,
        ticketId: ticket?.id ?? null,
      });
      if (result.ok) {
        try {
          sessionStorage.removeItem(STORE);
        } catch {}
        for (const p of ePayments) dropPhoto(p.id);
        const change = cashOn && received > cashPart ? roundPeso(received - cashPart) : 0;
        router.push(`/admin/pos/orders/${result.id}?new=1${change ? `&change=${change}` : ""}`);
        return;
      }
      if (result.unavailable) router.refresh();
      setError({ text: result.message, field: result.field, ticket: result.ticketClosed });
      if (result.field === "name" || result.field === "phone" || result.field === "needed_by") go("buyer");
      setBusy(false);
    } catch {
      // The reply was lost: the order may have gone in. The same key can't place it twice.
      setError({ text: "We couldn’t confirm the order went through. Check Custom orders before placing it again." });
      setBusy(false);
    }
  };

  // A ticket code typed, or typed by a USB scanner: anything starting with JJ that makes a whole code.
  const typedTicket = /^\s*jj/i.test(query) ? normalizeTicketCode(query) : null;
  const typingTicket = !typedTicket && /^\s*jj[-\s]?[0-9a-z]{0,4}\s*$/i.test(query);
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = designs.filter((d) => matches(d, tokens));
  const open = designs.find((d) => d.id === openId) ?? null;
  const piecesIn = (d: Design) => d.styles.reduce((s, st) => s + st.variants.reduce((n, v) => n + (pieces[v.id] ?? 0), 0), 0);
  const step: Step = view === "buyer" || view === "pay" ? view : "pieces";
  const strip = (
    <StepStrip
      current={step}
      onStep={(s) => (s === "pieces" ? go(open ? "design" : "designs") : go(s))}
    />
  );
  const orderBar = count > 0 && (view === "designs" || view === "design") && (
    <div className="pos-cartbar">
      <button
        type="button"
        onClick={() => go("buyer")}
        className="press flex h-14 w-full items-center justify-between gap-3 rounded-2xl bg-action px-5 text-action-ink shadow-[0_10px_30px_-12px_oklch(0.4_0.12_37.5/0.45)] hover:bg-action-deep"
      >
        <span className="whitespace-nowrap text-[0.9375rem] font-semibold">
          {count} {count === 1 ? "piece" : "pieces"} · <span className="tabular">{formatPeso(total)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[0.9375rem] font-semibold">
          Review order
          <ArrowRight aria-hidden="true" className="size-4" />
        </span>
      </button>
    </div>
  );

  // 1. All designs (also when the open design is gone from the catalog).
  if (view === "designs" || (view === "design" && !open)) {
    return (
      <div className={count ? "pb-24" : undefined}>
        <h2 ref={headingRef} tabIndex={-1} className="sr-only outline-none">
          Designs
        </h2>
        <div className="flex max-w-[40rem] gap-2">
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-[1.125rem] -translate-y-1/2 text-ink-2" />
            <label htmlFor={ids.search} className="sr-only">
              Search designs, or type a ticket code
            </label>
            <input
              id={ids.search}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && query) {
                  e.preventDefault();
                  setQuery("");
                  setTicketMsg(null);
                }
                // A USB scanner types the code and presses Enter.
                if (e.key === "Enter" && typedTicket) {
                  e.preventDefault();
                  findTicket(typedTicket);
                }
              }}
              placeholder="Team, design number, or ticket code"
              autoComplete="off"
              spellCheck={false}
              className="auth-input pl-11 pr-11"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="press absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-ink-2 hover:text-ink"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setTicketMsg(null);
              setScanning(true);
            }}
            className={outline}
          >
            <ScanLine aria-hidden="true" className="size-[1.125rem]" />
            <span className="max-sm:sr-only">Scan ticket</span>
          </button>
        </div>

        <div aria-live="polite" className="max-w-[40rem]">
          {ticketMsg && (
            <p role="alert" className="auth-alert mt-3 rounded-xl px-4 py-3 text-[0.9375rem]">
              {ticketMsg}
            </p>
          )}
          {looking && !typedTicket && (
            <p className="mt-3 inline-flex items-center gap-2 text-[0.9375rem] text-ink-2">
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              Looking up <span className="tabular">{looking}</span>…
            </p>
          )}
        </div>

        {typedTicket ? (
          <button
            type="button"
            onClick={() => findTicket(typedTicket)}
            disabled={!!looking}
            className="press mt-4 flex w-full max-w-[40rem] items-center gap-4 rounded-2xl px-4 py-3.5 text-left shadow-[inset_0_0_0_1.5px_var(--ink)] hover:bg-ground-2 disabled:opacity-70"
          >
            {looking ? (
              <LoaderCircle aria-hidden="true" className="size-5 shrink-0 animate-spin text-ink" />
            ) : (
              <TicketIcon aria-hidden="true" className="size-5 shrink-0 text-ink" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-[1rem] font-semibold text-ink">
                {looking ? "Looking up" : "Load ticket"} <span className="tabular whitespace-nowrap">{typedTicket}</span>
              </span>
              <span className="block text-[0.875rem] text-ink-2">The customer’s designs, sizes, and team details fill in the order.</span>
            </span>
            <kbd className="hidden shrink-0 rounded-md px-2 py-0.5 font-sans text-[0.75rem] font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--line)] lg:block">
              Enter
            </kbd>
          </button>
        ) : typingTicket && shown.length === 0 ? (
          <p className="py-8 text-[0.9375rem] text-ink-2">Ticket codes are JJ- and 5 letters or numbers, like JJ-7K3QM.</p>
        ) : designs.length === 0 ? (
          <p className="py-8 text-[0.9375rem] text-ink-2">No designs yet. Made-to-order products show up here once the owner adds them.</p>
        ) : shown.length === 0 ? (
          <p className="py-8 text-[0.9375rem] text-ink-2">No designs match “{query.trim()}”. Try the team name, its number, or a color.</p>
        ) : (
          <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {shown.map((d) => (
              <li key={d.id}>
                <DesignTile design={d} pieces={piecesIn(d)} onOpen={() => go("design", d.id)} />
              </li>
            ))}
          </ul>
        )}
        {orderBar}
        <TicketScanSheet open={scanning} onClose={() => setScanning(false)} onCode={findTicket} />
        <TicketChoice forOrder ticket={pending} current={ticket} onChoose={() => pending && applyTicket(pending)} onClose={() => setPending(null)} />
      </div>
    );
  }

  // 2. One design's pieces.
  if (view === "design" && open) {
    const mine = piecesIn(open);
    return (
      <div className={count ? "pb-24" : undefined}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => go("designs")} className={back}>
            <ArrowLeft aria-hidden="true" className="size-4" />
            All designs
          </button>
          {strip}
        </div>
        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-12">
          <div className="lg:sticky lg:top-[6.5rem] lg:self-start">
            <DesignPhoto src={open.image} name={open.name} className="mx-auto aspect-square w-full max-w-[26rem] rounded-[1.5rem]" />
          </div>
          <div className="min-w-0">
            <h2 ref={headingRef} tabIndex={-1} className="voice-display text-[clamp(2rem,4vw,2.75rem)] outline-none">
              {open.name}
            </h2>
            <p className="mt-1 text-[0.9375rem] text-ink-2">
              {open.number !== null && <>Design {open.number} · </>}Made to order. Type how many of each size.
            </p>
            <div className="mt-6">
              <PiecesEditor design={open} pieces={pieces} onChange={(v, q) => setQty(v, open.id, q)} />
            </div>
            <div className="mt-8 grid gap-2.5 sm:grid-cols-2">
              <button type="button" onClick={() => go("designs")} className={outlined}>
                {mine > 0 ? "Add another design" : "Back to designs"}
              </button>
              <button type="button" onClick={() => go("buyer")} disabled={count === 0} className={primary}>
                Review order
                <ArrowRight aria-hidden="true" className="size-5" />
              </button>
            </div>
          </div>
        </div>
        {orderBar && <div className="lg:hidden">{orderBar}</div>}
      </div>
    );
  }

  const summary = (editable: boolean) => (
    <section aria-labelledby="order-title">
      <div className="flex items-end justify-between gap-4 pb-3">
        <h3 id="order-title" className="voice-display text-[1.75rem]">
          Order
        </h3>
        <button type="button" onClick={startOver} className="press rounded-full px-2 py-1 text-[0.875rem] font-semibold text-ink-2 hover:text-ink">
          Start over
        </button>
      </div>
      {ticket && (
        <div className="-mt-3 mb-4">
          <TicketChip forOrder ticket={ticket} notes={ticketNotes} onRemove={dropTicket} />
        </div>
      )}
      {lines.length === 0 ? (
        <p className="border-t border-line py-6 text-[0.9375rem] text-ink-2">No pieces yet. Pick a design to start.</p>
      ) : (
        <OrderSummary
          lines={lines}
          designs={designs}
          onEdit={editable ? (id) => go("design", id) : undefined}
          onRemove={editable ? removeDesign : undefined}
        />
      )}
      {editable && (
        <button type="button" onClick={() => go("designs")} className="press mt-3 inline-flex items-center gap-1.5 py-1 text-[0.9375rem] font-semibold text-ink hover:underline">
          Add another design
        </button>
      )}
      <div className="board mt-4 flex items-center justify-between gap-4 rounded-2xl px-4 py-3 text-board-ink">
        <span className="text-[0.875rem]">
          <span className="voice-label block text-[0.75rem] uppercase text-board-ink-2">Total</span>
          {count} {count === 1 ? "piece" : "pieces"}
        </span>
        <FlipText text={formatPeso(total)} length={Math.max(6, formatPeso(total).length)} align="end" className="text-[1.75rem]" />
      </div>
    </section>
  );

  // 3. The buyer.
  if (view === "buyer") {
    const show = (k: keyof typeof buyerProblems) => (touched ? buyerProblems[k] : "");
    const field = (id: string, label: string, problem: string, input: React.ReactNode, hint?: string, optional?: boolean) => (
      <div>
        <label htmlFor={id} className="mb-2 block text-[0.9375rem] font-semibold text-ink">
          {label}
          {optional && <span className="ml-1.5 font-normal text-ink-2">(optional)</span>}
        </label>
        {input}
        {(problem || hint) && (
          <p id={`${id}-msg`} className={`mt-2 flex gap-2 text-[0.875rem] leading-snug ${problem ? "font-semibold text-ink" : "text-ink-2"}`}>
            {problem && <span aria-hidden="true" className="mt-[0.4em] size-1.5 shrink-0 rounded-full signal-dot" />}
            {problem || hint}
          </p>
        )}
      </div>
    );
    return (
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => go("designs")} className={back}>
            <ArrowLeft aria-hidden="true" className="size-4" />
            Designs
          </button>
          {strip}
        </div>
        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-12">
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              setTouched(true);
              if (buyerOk && count > 0) go("pay");
            }}
            className="order-2 lg:order-1"
          >
            <h2 ref={headingRef} tabIndex={-1} className="voice-display text-[clamp(2rem,4vw,2.75rem)] outline-none">
              Buyer
            </h2>
            <p className="mt-1 max-w-[52ch] text-[0.9375rem] text-ink-2">
              {ticket
                ? `Filled in from ${ticket.customer}’s account and ticket. Check them with the customer; the shop calls this number when it’s ready.`
                : "Who the order is for. The shop calls this number when it’s ready."}
            </p>
            {error && !error.field?.startsWith("pay") && (
              <p role="alert" className="auth-alert mt-5 rounded-xl px-4 py-3 text-[0.9375rem]">
                {error.text}
              </p>
            )}
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              {field(
                ids.name,
                "Name",
                show("name"),
                <input
                  id={ids.name}
                  value={buyer.name}
                  onChange={(e) => setBuyer((b) => ({ ...b, name: e.target.value }))}
                  autoComplete="off"
                  maxLength={80}
                  aria-invalid={!!show("name") || undefined}
                  aria-describedby={`${ids.name}-msg`}
                  className={`auth-input px-4 ${show("name") ? "is-invalid" : ""}`}
                />,
              )}
              {field(
                ids.phone,
                "Phone",
                show("phone"),
                <input
                  id={ids.phone}
                  type="tel"
                  inputMode="tel"
                  value={buyer.phone}
                  onChange={(e) => setBuyer((b) => ({ ...b, phone: e.target.value.replace(/[^\d+\s-]/g, "") }))}
                  autoComplete="off"
                  maxLength={20}
                  placeholder="0917 123 4567"
                  aria-invalid={!!show("phone") || undefined}
                  aria-describedby={`${ids.phone}-msg`}
                  className={`auth-input tabular px-4 ${show("phone") ? "is-invalid" : ""}`}
                />,
              )}
              {field(
                ids.team,
                "Team name",
                "",
                <input
                  id={ids.team}
                  value={buyer.team}
                  onChange={(e) => setBuyer((b) => ({ ...b, team: e.target.value }))}
                  autoComplete="off"
                  maxLength={80}
                  className="auth-input px-4"
                />,
                undefined,
                true,
              )}
              {field(
                ids.needed,
                "Needed by",
                show("neededBy"),
                <input
                  id={ids.needed}
                  type="date"
                  min={manilaDate()}
                  value={buyer.neededBy}
                  onChange={(e) => setBuyer((b) => ({ ...b, neededBy: e.target.value }))}
                  aria-invalid={!!show("neededBy") || undefined}
                  aria-describedby={`${ids.needed}-msg`}
                  className={`auth-input tabular px-4 ${show("neededBy") ? "is-invalid" : ""}`}
                />,
                undefined,
                true,
              )}
              <div className="sm:col-span-2">
                {field(
                  ids.notes,
                  "Notes",
                  "",
                  <textarea
                    id={ids.notes}
                    value={buyer.notes}
                    onChange={(e) => setBuyer((b) => ({ ...b, notes: e.target.value }))}
                    rows={4}
                    maxLength={2000}
                    placeholder={"Surnames and numbers, one per line\nDELA CRUZ 7 (M)\nSANTOS 23 (L)"}
                    aria-describedby={`${ids.notes}-msg`}
                    className="auth-input auth-input-grow min-h-28 resize-y px-4 py-3 leading-relaxed"
                  />,
                  "Player names and numbers, logo or color changes, anything the printer needs.",
                  true,
                )}
              </div>
            </div>
            <button type="submit" disabled={count === 0} className={`${primary} mt-8 sm:max-w-[22rem]`}>
              Next: payment
              <ArrowRight aria-hidden="true" className="size-5" />
            </button>
          </form>
          <div className="order-1 lg:order-2 lg:sticky lg:top-[6.5rem] lg:self-start">{summary(true)}</div>
        </div>
      </div>
    );
  }

  // 4. Payment.
  const chip = (on: boolean) =>
    `press inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-[0.9375rem] font-semibold ${
      on ? "bg-ink text-ground" : "text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2"
    }`;
  const isHalf = !amount.trim() || parseAmount(amount) === half;
  const isFull = amount.trim() !== "" && parseAmount(amount) === total;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => go("buyer")} className={back}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          Buyer
        </button>
        {strip}
      </div>
      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-12">
        <div className="min-w-0">
          {summary(false)}
          <dl className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-[0.9375rem]">
            <dt className="text-ink-2">Buyer</dt>
            <dd className="text-ink">
              {buyer.name.trim()} · <span className="tabular">{buyer.phone.trim()}</span>
            </dd>
            {buyer.team.trim() && (
              <>
                <dt className="text-ink-2">Team</dt>
                <dd className="text-ink">{buyer.team.trim()}</dd>
              </>
            )}
            {buyer.neededBy && (
              <>
                <dt className="text-ink-2">Needed by</dt>
                <dd className="tabular text-ink">
                  {new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${buyer.neededBy}T00:00:00Z`))}
                </dd>
              </>
            )}
          </dl>
        </div>

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            place();
          }}
          className="lg:sticky lg:top-[6.5rem] lg:self-start lg:rounded-[1.25rem] lg:p-5 lg:shadow-[inset_0_0_0_1px_var(--line)]"
        >
          <h2 ref={headingRef} tabIndex={-1} className="voice-display border-b border-line pb-3 text-[1.75rem] outline-none">
            Payment
          </h2>
          <fieldset className="mt-4">
            <legend className="text-[0.9375rem] font-semibold text-ink">Paying now</legend>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button type="button" aria-pressed={isHalf} onClick={() => setAmount("")} className={chip(isHalf)}>
                Half <span className="tabular font-normal opacity-80">{formatPeso(half)}</span>
              </button>
              <button type="button" aria-pressed={isFull} onClick={() => setAmount(String(total))} className={chip(isFull)}>
                Full <span className="tabular font-normal opacity-80">{formatPeso(total)}</span>
              </button>
            </div>
            <label htmlFor={ids.amount} className="mt-3 block text-[0.875rem] text-ink-2">
              Or another amount, from {formatPeso(half)} to {formatPeso(total)}
            </label>
            <div className="auth-input mt-1.5 flex items-center">
              <span aria-hidden="true" className="pl-4 text-ink-2">
                ₱
              </span>
              <input
                id={ids.amount}
                inputMode="decimal"
                value={amount}
                placeholder={String(half)}
                onChange={(e) => {
                  setAmount(e.target.value.replace(/[^\d.,]/g, ""));
                  setError(null);
                }}
                className="tabular h-full min-w-0 flex-1 bg-transparent pl-1 pr-4 outline-none placeholder:text-ink-2"
              />
            </div>
          </fieldset>

          <div className="mt-5">
            <PosPayments
              total={payingNow}
              providers={providers}
              cashOn={cashOn}
              onCashOn={(on) => {
                setCashOn(on);
                setError(null);
              }}
              cash={cash}
              onCash={(v) => {
                setCash(v);
                setError(null);
              }}
              ePayments={ePayments}
              onNew={(code) => setSession({ id: uuid(), provider: code, editing: null })}
              onEdit={(id) => {
                const p = ePayments.find((x) => x.id === id);
                if (p) setSession({ id: uuid(), provider: p.provider, editing: p });
              }}
              onRemove={(id) => {
                setEPayments((all) => all.filter((p) => p.id !== id));
                dropPhoto(id);
                setError(null);
              }}
            />
          </div>

          <dl className="tabular mt-5 grid grid-cols-[1fr_auto] gap-y-1.5 border-t border-line pt-4 text-[0.9375rem]">
            <dt className="text-ink-2">Paid now</dt>
            <dd className="text-right font-semibold text-ink">{formatPeso(Math.min(payingNow, total))}</dd>
            <dt className="text-ink-2">Balance at pickup</dt>
            <dd className="text-right font-semibold text-ink">{balance > 0 ? formatPeso(balance) : "Fully paid"}</dd>
          </dl>

          {error && (
            <p role="alert" className="auth-alert mt-4 rounded-xl px-4 py-3 text-[0.9375rem]">
              {error.text}
            </p>
          )}
          <button type="submit" disabled={!canPlace} className={`${primary} mt-5`}>
            {busy && <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />}
            {busy ? "Placing order…" : `Place order · ${formatPeso(Math.min(payingNow, total))}`}
          </button>
          {!busy && !canPlace && (
            <p className="mt-2 text-center text-[0.8125rem] text-ink-2">
              {count === 0 ? "Add pieces first." : !buyerOk ? "Finish the buyer’s details first." : payProblem}
            </p>
          )}
        </form>
      </div>

      <PosScanSheet
        session={session}
        reader={reader}
        isOwner={isOwner}
        providers={providers}
        due={dueFor(session?.editing?.id ?? null)}
        others={ePayments}
        photo={session?.editing ? (photos[session.editing.id] ?? null) : null}
        onProvider={(code) => setSession((s) => (s ? { ...s, provider: code } : s))}
        onAdd={(payment, photo) => {
          setEPayments((all) => (all.some((p) => p.id === payment.id) ? all.map((p) => (p.id === payment.id ? payment : p)) : [...all, payment]));
          setPhotos((all) => {
            const old = all[payment.id];
            if (old && old.url !== photo?.url) URL.revokeObjectURL(old.url);
            const rest = { ...all };
            if (photo) rest[payment.id] = photo;
            else delete rest[payment.id];
            return rest;
          });
          setError(null);
          setSession(null);
        }}
        onRemove={(id) => {
          setEPayments((all) => all.filter((p) => p.id !== id));
          dropPhoto(id);
          setSession(null);
        }}
        onClose={() => setSession(null)}
      />
    </div>
  );
}
