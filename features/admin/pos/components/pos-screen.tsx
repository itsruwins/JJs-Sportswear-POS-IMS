"use client";

import { uuid } from "@/lib/uuid";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronDown, LoaderCircle, Minus, Plus, Search, Trash2, X } from "lucide-react";
import { createSale, type LineProblem, type PaymentPart } from "@/features/admin/pos/actions";
import { ProductThumb } from "@/features/admin/products/components/product-parts";
import { FlipText } from "@/features/shared/ui/flip-text";
import { formatPeso } from "@/features/shared/catalog/catalog";
import type { PaymentProvider } from "@/features/shared/payments/model";
import { parseAmount, roundPeso } from "@/features/admin/pos/amounts";
import type { EPayment } from "@/features/admin/pos/scan";
import { PosPayments } from "@/features/admin/pos/components/pos-payments";
import { PosScanSheet, type ReceiptPhoto, type ScanSession } from "@/features/admin/pos/components/pos-scan-sheet";

export type PosVariant = {
  id: string;
  size: string | null;
  color: string | null;
  sku: string | null;
  price: number;
  stock: number;
  threshold: number;
};
export type PosProduct = { id: string; name: string; image: string | null; tags: string[]; variants: PosVariant[] };

type CartLine = { variantId: string; qty: number };
type Line = CartLine & { product: PosProduct | null; variant: PosVariant | null };
type Issue = { kind: "short"; available: number } | { kind: "unavailable" } | null;

/** The sale in progress, kept for this browser tab so a stray tap or a refresh doesn't lose it (receipt photos aren't kept). */
type Saved = { cart: CartLine[]; cashOn: boolean; cash: string; ePayments: EPayment[]; key: string };
/** A sale saved by an earlier version: one method ("gcash" before e-payments), and no list of e-payments. */
type OldSaved = Partial<Saved> & { method?: "cash" | "e_payment" | "gcash" };
const STORE = "jj-pos-sale";

const variantName = (v: Pick<PosVariant, "size" | "color">) => [v.size, v.color].filter(Boolean).join(" · ") || "One size";
const outline =
  "press inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2 disabled:opacity-50";
const newKey = () => uuid();

/** Each word must match the product (name, tag) or one and the same variant (color, SKU, exact size). */
function matches(p: PosProduct, tokens: string[]) {
  const productText = [p.name, ...p.tags].join(" ").toLowerCase();
  const onProduct = (t: string) => productText.includes(t);
  if (tokens.every(onProduct)) return true;
  return p.variants.some((v) => {
    const text = [v.color, v.sku].filter(Boolean).join(" ").toLowerCase();
    return tokens.every((t) => onProduct(t) || text.includes(t) || (v.size ?? "").toLowerCase() === t);
  });
}

/** The counter screen: search and pick on the left, the sale on the right (a second step on phones). */
export function PosScreen({
  products,
  providers,
  reader,
  isOwner,
  header,
}: {
  products: PosProduct[];
  providers: PaymentProvider[];
  /** Whether receipt photos can be read (the Gemini key is set on the server). */
  reader: boolean;
  /** The owner is ringing up the sale (approvals need only a reason). */
  isOwner: boolean;
  header?: React.ReactNode;
}) {
  const router = useRouter();
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const saleHeadingRef = useRef<HTMLHeadingElement>(null);
  const lineRefs = useRef(new Map<string, HTMLLIElement>());
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [view, setView] = useState<"pick" | "cart">("pick");
  // Payments: cash (when on) plus any e-payments, in the order they were added.
  const [cashOn, setCashOn] = useState(true);
  const [cash, setCash] = useState("");
  const [ePayments, setEPayments] = useState<EPayment[]>([]);
  // The e-payment sheet, and the receipt photos taken in this tab (kept to reopen a payment; never saved).
  const [session, setSession] = useState<ScanSession | null>(null);
  const [photos, setPhotos] = useState<Record<string, ReceiptPhoto>>({});
  // One key per sale: a Charge retried after a lost reply returns the same sale, never a second one.
  const [saleKey, setSaleKey] = useState(newKey);
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; unsure?: boolean } | null>(null);
  // What the database said about a line at checkout, until that line changes.
  const [refused, setRefused] = useState<Record<string, LineProblem>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const [said, setSaid] = useState("");

  // Bring back a sale left open in this tab (after hydration, so server and browser render the same first).
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORE) ?? "null") as OldSaved | null;
      if (saved?.cart?.length) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring browser storage once, after hydration
        setCart(saved.cart);
        setCashOn(saved.cashOn ?? !(saved.method === "e_payment" || saved.method === "gcash"));
        setCash(saved.cash ?? "");
        setEPayments((saved.ePayments ?? []).filter((p) => providers.some((x) => x.code === p.provider)));
        if (saved.key) setSaleKey(saved.key);
      }
    } catch {
      // Storage unavailable (private mode, blocked): the sale just isn't kept across reloads.
    }
    setRestored(true);
    // Once, after hydration: a providers list that changes later doesn't bring the old sale back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      if (cart.length) sessionStorage.setItem(STORE, JSON.stringify({ cart, cashOn, cash, ePayments, key: saleKey } satisfies Saved));
      else sessionStorage.removeItem(STORE);
    } catch {
      // See above.
    }
  }, [restored, cart, cashOn, cash, ePayments, saleKey]);

  // Counters with a keyboard start typing straight away; phones don't get the keyboard thrown up.
  useEffect(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) searchRef.current?.focus();
  }, []);

  // Show the line a tap just changed, and flash it once.
  useEffect(() => {
    if (!flash) return;
    lineRefs.current.get(flash)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const t = window.setTimeout(() => setFlash(null), 700);
    return () => window.clearTimeout(t);
  }, [flash]);

  const index = useMemo(() => {
    const m = new Map<string, { product: PosProduct; variant: PosVariant }>();
    for (const p of products) for (const v of p.variants) m.set(v.id, { product: p, variant: v });
    return m;
  }, [products]);

  const shown = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    return tokens.length ? products.filter((p) => matches(p, tokens)) : products;
  }, [products, query]);
  // A search that narrows to one item opens it, unless it was just closed.
  const autoOpen = query.trim() && shown.length === 1 ? shown[0].id : null;
  const isOpen = (id: string) => (open === null ? autoOpen === id : open === id);

  // The cart always reads today's stock and price; a line whose item left the catalog stays, flagged.
  const lines: Line[] = cart.map((c) => ({ ...c, product: index.get(c.variantId)?.product ?? null, variant: index.get(c.variantId)?.variant ?? null }));
  const issueOf = (l: Line): Issue => {
    if (!l.variant) return { kind: "unavailable" };
    const r = refused[l.variantId];
    if (r?.kind === "unavailable") return { kind: "unavailable" };
    const available = Math.min(l.variant.stock, r?.kind === "short" ? r.available : Infinity);
    return l.qty > available ? { kind: "short", available } : null;
  };
  const total = Math.round(lines.reduce((s, l) => s + (l.variant?.price ?? 0) * l.qty, 0) * 100) / 100;
  const pieces = lines.reduce((s, l) => s + l.qty, 0);
  const hasIssue = lines.some((l) => issueOf(l));
  const inCart = (variantId: string) => cart.find((c) => c.variantId === variantId)?.qty ?? 0;

  // The same rules the database applies: the payments cover the total, change is cash, and cash
  // on top of e-payments that already cover the total would only come straight back out.
  const received = cashOn ? parseAmount(cash) : 0;
  const epay = roundPeso(ePayments.reduce((s, p) => s + p.amount, 0));
  const due = roundPeso(total - received - epay);
  const cashNotNeeded = received > 0 && ePayments.length > 0 && epay >= total;
  const started = ePayments.length > 0 || (cashOn && cash.trim() !== "");
  const paymentOk = started && due <= 0 && !cashNotNeeded;
  const canCharge = lines.length > 0 && !hasIssue && paymentOk && !busy;
  const blocked = hasIssue
    ? "Fix the flagged items first."
    : !started
      ? cashOn
        ? "Enter the cash received."
        : "Pick the bank or e-wallet, then photograph the receipt."
      : cashNotNeeded
        ? "The e-payments already cover the total. Remove the cash."
        : ePayments.length === 0
          ? `Cash is short by ${formatPeso(due)}.`
          : `${formatPeso(due)} still due.`;
  // What a new (or reopened) e-payment has left to cover: the total less every other payment.
  const dueFor = (id: string | null) => roundPeso(total - received - ePayments.filter((p) => p.id !== id).reduce((s, p) => s + p.amount, 0));

  const dropPhoto = (id: string) =>
    setPhotos((all) => {
      if (!all[id]) return all;
      URL.revokeObjectURL(all[id].url);
      const rest = { ...all };
      delete rest[id];
      return rest;
    });

  const setQty = (variantId: string, qty: number) => {
    const l = lines.find((x) => x.variantId === variantId);
    setError(null);
    setRefused((r) => Object.fromEntries(Object.entries(r).filter(([id]) => id !== variantId)));
    setCart((c) => (qty <= 0 ? c.filter((x) => x.variantId !== variantId) : c.map((x) => (x.variantId === variantId ? { ...x, qty } : x))));
    const name = l ? `${l.product?.name ?? "Item"}, ${l.variant ? variantName(l.variant) : ""}` : "Item";
    setSaid(qty <= 0 ? `Removed ${name}.` : `${name}: ${qty}.`);
    if (qty > 0) setFlash(variantId);
  };

  const add = (p: PosProduct, v: PosVariant) => {
    const now = inCart(v.id);
    if (now >= v.stock) return;
    setError(null);
    setCart((c) => (now ? c.map((l) => (l.variantId === v.id ? { ...l, qty: l.qty + 1 } : l)) : [...c, { variantId: v.id, qty: 1 }]));
    setFlash(v.id);
    setSaid(`Added ${p.name}, ${variantName(v)}. ${now + 1} in the sale.`);
  };

  const clear = () => {
    setCart([]);
    setRefused({});
    setCash("");
    setCashOn(true);
    setEPayments([]);
    Object.values(photos).forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos({});
    setError(null);
    setSaleKey(newKey());
    setView("pick");
    setSaid("Sale cleared.");
  };

  // Phones: moving between the two steps puts focus at the top of the new one.
  const showSale = () => {
    setView("cart");
    requestAnimationFrame(() => saleHeadingRef.current?.focus());
  };
  const showPicker = () => {
    setView("pick");
    requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
  };

  const charge = async () => {
    if (!canCharge) return;
    setBusy(true);
    setError(null);
    const payments: PaymentPart[] = [
      ...ePayments.map((p) => ({
        method: "e_payment" as const,
        provider: p.provider,
        reference: p.reference,
        amount: p.amount,
        scanId: p.scanId ?? null,
        overrideId: p.approval?.id ?? null,
      })),
      ...(received > 0 ? [{ method: "cash" as const, amount: received }] : []),
    ];
    try {
      const result = await createSale(
        lines.map((l) => ({ variantId: l.variantId, quantity: l.qty })),
        payments,
        saleKey,
      );
      if (result.ok) {
        try {
          sessionStorage.removeItem(STORE);
        } catch {}
        setCart([]);
        router.push(`/admin/sales/${result.id}?new=1`);
        return;
      }
      setError({ text: result.message });
      const p = result.problem;
      if (p) {
        const line = lines.find((l) => (p.variantId ? l.variantId === p.variantId : p.sku && l.variant?.sku === p.sku));
        if (line) setRefused((r) => ({ ...r, [line.variantId]: p }));
        router.refresh(); // pull the latest stock
      }
      setBusy(false);
    } catch {
      // The reply was lost: the sale may or may not have been recorded. The sale stays here (and in this tab),
      // and charging again with the same key can't record it twice once the database update is in.
      setError({ text: "We couldn’t confirm the sale went through. Check Sales before charging again.", unsure: true });
      setBusy(false);
    }
  };

  return (
    <div className={`lg:grid lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-start lg:gap-10 ${lines.length && view === "pick" ? "pb-24 lg:pb-0" : ""}`}>
      <p aria-live="polite" className="sr-only">
        {said}
      </p>

      {/* Find and pick */}
      <section aria-label="Find items" className={view === "cart" ? "hidden lg:block" : undefined}>
        {/* The page header sits in this column, so the sale panel starts at the top on desktop. */}
        {header}
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-[1.125rem] -translate-y-1/2 text-ink-2" />
          <label htmlFor={searchId} className="sr-only">
            Search items
          </label>
          <input
            ref={searchRef}
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.preventDefault();
                setQuery("");
                setOpen(null);
              }
            }}
            placeholder="Name, SKU, size, or color"
            autoComplete="off"
            spellCheck={false}
            className="auth-input pl-11 pr-11"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setOpen(null);
                searchRef.current?.focus();
              }}
              aria-label="Clear search"
              className="press absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-ink-2 hover:text-ink"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>

        {products.length === 0 ? (
          <p className="py-8 text-[0.9375rem] text-ink-2">Nothing is on sale yet. Add products and stock first.</p>
        ) : shown.length === 0 ? (
          <p className="py-8 text-[0.9375rem] text-ink-2">No items match “{query.trim()}”. Try the name, a size, or a color.</p>
        ) : (
          <ul className="mt-4">
            {shown.map((p) => (
              <ProductRow
                key={p.id}
                product={p}
                open={isOpen(p.id)}
                onToggle={() => setOpen(isOpen(p.id) ? "" : p.id)}
                inCart={inCart}
                onAdd={add}
              />
            ))}
          </ul>
        )}
      </section>

      {/* The sale */}
      <aside
        aria-label="Current sale"
        // Desktop: a column that never runs under the dock. Items scroll; total, payment, and Charge stay put.
        className={`${view === "pick" ? "hidden lg:flex" : "flex"} flex-col lg:sticky lg:top-[6.5rem] lg:max-h-[calc(100dvh-13rem)] lg:rounded-[1.25rem] lg:p-5 lg:shadow-[inset_0_0_0_1px_var(--line)]`}
      >
        <button type="button" onClick={showPicker} className="press mb-4 inline-flex items-center gap-1.5 self-start py-1 text-[0.9375rem] font-semibold text-ink lg:hidden">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Add more items
        </button>

        <div className="flex items-end justify-between gap-4 border-b border-line pb-3">
          <h2 ref={saleHeadingRef} tabIndex={-1} className="voice-display text-[1.75rem] outline-none">
            Sale
          </h2>
          {lines.length > 0 && (
            <button type="button" onClick={clear} className="press rounded-full px-2 py-1 text-[0.875rem] font-semibold text-ink-2 hover:text-ink">
              Clear
            </button>
          )}
        </div>

        {lines.length === 0 ? (
          <p className="py-6 text-[0.9375rem] text-ink-2">Tap an item, then a size, to add it here.</p>
        ) : (
          // The bottom edge fades on desktop, so a longer sale reads as "more below".
          <ul className="lg:-mx-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-1 lg:pb-4 lg:[mask-image:linear-gradient(to_bottom,black_calc(100%-1.5rem),transparent)]">
            {lines.map((l) => (
              <CartRow
                key={l.variantId}
                line={l}
                issue={issueOf(l)}
                flash={flash === l.variantId}
                onQty={(q) => setQty(l.variantId, q)}
                rowRef={(el) => {
                  if (el) lineRefs.current.set(l.variantId, el);
                  else lineRefs.current.delete(l.variantId);
                }}
              />
            ))}
          </ul>
        )}

        {lines.length > 0 && (
          <form
            className="lg:shrink-0"
            onSubmit={(e) => {
              e.preventDefault();
              charge();
            }}
          >
            <div className="board mt-3 flex items-center justify-between gap-4 rounded-2xl px-4 py-3 text-board-ink">
              <span className="text-[0.875rem]">
                <span className="voice-label block text-[0.75rem] uppercase text-board-ink-2">Total</span>
                {pieces} {pieces === 1 ? "piece" : "pieces"}
              </span>
              <FlipText text={formatPeso(total)} length={Math.max(6, formatPeso(total).length)} align="end" className="text-[1.75rem]" />
            </div>

            <div className="mt-4">
              <PosPayments
                total={total}
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

            {error && (
              <p role="alert" className="auth-alert mt-4 rounded-xl px-4 py-3 text-[0.9375rem]">
                {error.text}
                {error.unsure && (
                  <>
                    {" "}
                    <Link href="/admin/sales" className="font-semibold underline underline-offset-2">
                      Open Sales
                    </Link>
                  </>
                )}
              </p>
            )}

            <button
              type="submit"
              disabled={!canCharge}
              className="press mt-5 inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-board px-5 text-[1.0625rem] font-semibold text-board-ink hover:bg-board-deep disabled:opacity-50"
            >
              {busy && <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />}
              {busy ? "Recording sale…" : `Charge ${formatPeso(total)}`}
            </button>
            {!busy && !canCharge && <p className="mt-2 text-center text-[0.8125rem] text-ink-2">{blocked}</p>}
          </form>
        )}
      </aside>

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
          setSaid(`Added ${providers.find((x) => x.code === payment.provider)?.name ?? "e-payment"} payment of ${formatPeso(payment.amount)}.`);
          setSession(null);
        }}
        onRemove={(id) => {
          setEPayments((all) => all.filter((p) => p.id !== id));
          dropPhoto(id);
          setSession(null);
        }}
        onClose={() => setSession(null)}
      />

      {/* Phones and tablets: the sale is one tap away while picking. */}
      {lines.length > 0 && view === "pick" && (
        <div className="pos-cartbar lg:hidden">
          <button
            type="button"
            onClick={showSale}
            className="press flex h-14 w-full items-center justify-between gap-3 rounded-2xl bg-board px-5 text-board-ink shadow-[0_10px_30px_-12px_oklch(0.2_0.05_158/0.55)] hover:bg-board-deep"
          >
            <span className="whitespace-nowrap text-[0.9375rem] font-semibold">
              {pieces} {pieces === 1 ? "piece" : "pieces"} · <span className="tabular">{formatPeso(total)}</span>
            </span>
            {/* When a line needs fixing, that's what the bar says instead of "Review sale". */}
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[0.9375rem] font-semibold">
              {hasIssue ? (
                <>
                  <span className="rounded-full bg-amber px-2.5 py-0.5 text-[0.8125rem] text-amber-ink">Check items</span>
                  <span className="sr-only">, review sale</span>
                </>
              ) : (
                "Review sale"
              )}
              <ArrowRight aria-hidden="true" className="size-4" />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

function ProductRow({
  product: p,
  open,
  onToggle,
  inCart,
  onAdd,
}: {
  product: PosProduct;
  open: boolean;
  onToggle: () => void;
  inCart: (variantId: string) => number;
  onAdd: (p: PosProduct, v: PosVariant) => void;
}) {
  const panelId = useId();
  const stock = p.variants.reduce((s, v) => s + v.stock, 0);
  const prices = p.variants.map((v) => v.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const colors = [...new Set(p.variants.map((v) => v.color ?? ""))];

  return (
    <li className="border-b border-line">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="press flex w-full items-center gap-4 py-3 text-left"
      >
        <ProductThumb src={p.image} name={p.name} />
        <span className="min-w-0 flex-1">
          <span className="block text-[1rem] font-semibold leading-snug text-ink">{p.name}</span>
          <span className="tabular mt-0.5 block text-[0.875rem] text-ink-2">
            {min === max ? formatPeso(min) : `${formatPeso(min)}–${formatPeso(max)}`} ·{" "}
            {stock === 0 ? <span className="font-semibold text-ink">Sold out</span> : `${stock} in stock`}
          </span>
        </span>
        <ChevronDown aria-hidden="true" className={`size-5 shrink-0 text-ink-2 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div id={panelId} className="pb-4 pl-[4.5rem]">
          {colors.map((color) => (
            <div key={color} className="mb-3 last:mb-0">
              {(colors.length > 1 || color) && <p className="voice-label mb-1.5 text-[0.75rem] text-ink-2">{color || "No color"}</p>}
              <ul className="flex flex-wrap gap-1.5">
                {p.variants
                  .filter((v) => (v.color ?? "") === color)
                  .map((v) => {
                    const left = v.stock - inCart(v.id);
                    const state = left <= 0 ? "zero" : left <= v.threshold ? "low" : "in";
                    const differs = min !== max;
                    return (
                      <li key={v.id}>
                        <button
                          type="button"
                          onClick={() => onAdd(p, v)}
                          disabled={left <= 0}
                          data-stock={state}
                          aria-label={`Add ${v.size || "one size"}${v.color ? ` ${v.color}` : ""}, ${formatPeso(v.price)}, ${left <= 0 ? "none left" : `${left} left`}`}
                          title={`${variantName(v)} · ${formatPeso(v.price)} · ${Math.max(0, left)} left`}
                          className="cell press flex h-14 min-w-14 flex-col items-center justify-center rounded-lg px-2 hover:brightness-95 disabled:cursor-not-allowed disabled:hover:brightness-100"
                        >
                          <span aria-hidden="true" className="voice-label text-[0.75rem] leading-none opacity-80">
                            {v.size || "One"}
                          </span>
                          <span aria-hidden="true" className="voice-board tabular mt-1 text-[1.25rem] leading-none">
                            {Math.max(0, left)}
                          </span>
                          {differs && (
                            <span aria-hidden="true" className="tabular mt-0.5 text-[0.625rem] leading-none opacity-75">
                              {formatPeso(v.price)}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

/** One line of the sale on a single row: what it is, how many (typed or stepped), the line total, remove. */
function CartRow({
  line: l,
  issue,
  flash,
  onQty,
  rowRef,
}: {
  line: Line;
  issue: Issue;
  flash: boolean;
  onQty: (qty: number) => void;
  rowRef: (el: HTMLLIElement | null) => void;
}) {
  const name = l.product?.name ?? "Item no longer on sale";
  const full = l.variant ? `${name}, ${variantName(l.variant)}` : name;
  const max = l.variant?.stock ?? 0;
  return (
    <li
      ref={rowRef}
      className={`-mx-2 rounded-xl border-b border-line px-2 py-2.5 transition-colors duration-500 ${flash ? "bg-ground-2" : "bg-transparent"}`}
    >
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.9375rem] font-semibold leading-snug text-ink">{name}</p>
          <p className="tabular truncate text-[0.8125rem] text-ink-2">
            {l.variant ? `${variantName(l.variant)} · ${formatPeso(l.variant.price)}` : "Remove it to continue"}
          </p>
        </div>

        <div role="group" aria-label={`${full}, quantity`} className="flex shrink-0 items-center rounded-xl shadow-[inset_0_0_0_1px_var(--line)]">
          <button
            type="button"
            onClick={() => onQty(l.qty - 1)}
            aria-label={l.qty <= 1 ? `Remove ${full}` : "One fewer"}
            className="press grid size-9 place-items-center rounded-l-xl text-ink hover:bg-ground-2"
          >
            <Minus aria-hidden="true" className="size-4" />
          </button>
          <input
            inputMode="numeric"
            aria-label="Quantity"
            value={l.qty}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
              if (Number.isFinite(n) && n > 0) onQty(Math.min(n, Math.max(max, 1)));
            }}
            className="tabular h-9 w-9 bg-transparent text-center text-[0.9375rem] font-semibold text-ink outline-none focus-visible:rounded-md focus-visible:shadow-[0_0_0_2px_var(--amber)]"
          />
          <button
            type="button"
            onClick={() => onQty(l.qty + 1)}
            disabled={!l.variant || l.qty >= max}
            aria-label="One more"
            className="press grid size-9 place-items-center rounded-r-xl text-ink hover:bg-ground-2 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Plus aria-hidden="true" className="size-4" />
          </button>
        </div>

        <p className="tabular w-[4.5rem] shrink-0 text-right text-[0.9375rem] font-semibold text-ink">{formatPeso((l.variant?.price ?? 0) * l.qty)}</p>

        <button
          type="button"
          onClick={() => onQty(0)}
          aria-label={`Remove ${full}`}
          className="press -mr-1 grid size-9 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-ground-2 hover:text-ink"
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </button>
      </div>

      {issue && (
        <div role="alert" className="auth-alert mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-[0.875rem]">
          <span>
            {issue.kind === "unavailable" ? "No longer on sale." : issue.available === 0 ? "Just sold out." : `Only ${issue.available} left now.`}
          </span>
          {issue.kind === "short" && issue.available > 0 ? (
            <button type="button" onClick={() => onQty(issue.available)} className={`${outline} h-8 bg-ground px-3 text-[0.8125rem]`}>
              Change to {issue.available}
            </button>
          ) : (
            <button type="button" onClick={() => onQty(0)} className={`${outline} h-8 bg-ground px-3 text-[0.8125rem]`}>
              Remove
            </button>
          )}
        </div>
      )}
    </li>
  );
}
