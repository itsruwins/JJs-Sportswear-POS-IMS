"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, LoaderCircle, X } from "lucide-react";
import { adjustStock, type EntryResult } from "@/features/admin/stock/actions";
import { sortColors, sortSizes, unique, type CatalogProduct } from "@/features/shared/catalog/catalog";
import { MAX_AMOUNT, MAX_NOTE, STOCK_ACTIONS, stockAction, type StockAction } from "@/features/admin/stock/model";

type Props = {
  product: CatalogProduct | null;
  open: boolean;
  onClose: () => void;
  initialAction?: StockAction;
  /** Put the cursor straight into this size/color. */
  focusVariantId?: string;
};

const whole = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : NaN);

/** Restock, return, damage, or recount several sizes and colors of one product at once. */
export function AdjustSheet({ product, open, onClose, initialAction = "restock", focusVariantId }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      const target =
        (focusVariantId && d.querySelector<HTMLInputElement>(`#adj-${CSS.escape(focusVariantId)}`)) ||
        d.querySelector<HTMLInputElement>("input[inputmode=numeric]");
      target?.focus();
      target?.select();
    } else if (!open && d.open) d.close();
  }, [open, focusVariantId]);

  return (
    <dialog ref={ref} className="auth-dialog dialog-wide" aria-labelledby={titleId} onClose={onClose}>
      <div className="auth-sheet overflow-x-hidden overflow-y-auto no-scrollbar">
        {product && open && (
          <SheetBody
            key={`${product.id}-${initialAction}`}
            product={product}
            initialAction={initialAction}
            titleId={titleId}
            onDone={() => ref.current?.close()}
          />
        )}
      </div>
    </dialog>
  );
}

function SheetBody({
  product,
  initialAction,
  titleId,
  onDone,
}: {
  product: CatalogProduct;
  initialAction: StockAction;
  titleId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const live = useMemo(() => product.variants.filter((v) => v.is_active), [product]);
  const [action, setAction] = useState<StockAction>(initialAction);
  const info = stockAction(action);
  // Only what staff actually typed. Untouched boxes follow the product as it refreshes,
  // so a recount can never resend a count that has since changed.
  const [typed, setTyped] = useState<Record<string, string>>({});
  const shown = (v: CatalogProduct["variants"][number]) =>
    typed[v.id] ?? (action === "recount" ? String(v.stock_quantity) : "");
  const [pick, setPick] = useState(info.reasons[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [failed, setFailed] = useState<Record<string, string>>({});

  const switchAction = (next: StockAction) => {
    setAction(next);
    setTyped({});
    setPick(stockAction(next).reasons[0]);
    setFailed({});
    setMessage(null);
  };

  const sizes = sortSizes(unique(live.map((v) => v.size ?? "One size")));
  const colors = sortColors(unique(live.map((v) => v.color ?? "—")));
  const cellFor = (size: string, color: string) =>
    live.find((x) => (x.size ?? "One size") === size && (x.color ?? "—") === color);

  // What each filled-in cell will do.
  const changes = live
    .filter((v) => typed[v.id] !== undefined)
    .map((v) => {
      const raw = typed[v.id];
      const n = whole(raw);
      if (!raw.trim() || !Number.isFinite(n)) return null;
      const now = v.stock_quantity;
      const next = action === "recount" ? n : action === "damage" ? now - n : now + n;
      if (action === "recount" ? n === now : n === 0) return null;
      return { variant: v, amount: n, now, next, delta: next - now };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const invalid: Record<string, string> = {};
  for (const v of live) {
    const raw = typed[v.id];
    if (raw === undefined || !raw.trim()) continue;
    const n = whole(raw);
    if (!Number.isFinite(n) || n > MAX_AMOUNT) invalid[v.id] = "Use a whole number";
    else if (action === "damage" && n > v.stock_quantity) invalid[v.id] = `Only ${v.stock_quantity} in stock`;
  }
  // The summary counts only changes that can actually be saved.
  const valid = changes.filter((c) => !invalid[c.variant.id]);
  const net = valid.reduce((sum, c) => sum + c.delta, 0);
  const canSave = changes.length > 0 && Object.keys(invalid).length === 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setMessage(null);
    let result: Awaited<ReturnType<typeof adjustStock>>;
    try {
      result = await adjustStock(
        action,
        changes.map((c) => ({ variantId: c.variant.id, amount: c.amount })),
        pick,
        note,
      );
    } catch {
      setMessage({ tone: "error", text: "We couldn’t confirm this save. Check Recent changes before trying again." });
      router.refresh();
      return;
    } finally {
      setSaving(false);
    }
    router.refresh();

    const bad: Record<string, string> = {};
    for (const r of result.results as EntryResult[]) if (!r.ok) bad[r.variantId] = r.message ?? "Didn’t save";
    setFailed(bad);
    // Clear only the boxes that saved; anything rejected or untried keeps what was typed.
    const saved = new Set((result.results as EntryResult[]).filter((r) => r.ok).map((r) => r.variantId));
    // A recount box typed to the count already on record isn't a change; drop it so a later sale can't turn it into one.
    const unchanged = new Set(
      action === "recount" ? live.filter((v) => whole(typed[v.id] ?? "") === v.stock_quantity).map((v) => v.id) : [],
    );
    setTyped((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !saved.has(id) && !unchanged.has(id))));

    if (result.ok) {
      const done = result.results.filter((r) => !r.skipped).length;
      setMessage({
        tone: "ok",
        text: done === 0 ? "Nothing changed: the counts already matched." : `Saved ${done} ${done === 1 ? "change" : "changes"}. Stock is updated.`,
      });
    } else {
      setMessage({ tone: "error", text: result.message });
    }
  };

  return (
    <>
      <header className="auth-head relative px-5 pb-5 pt-4 text-board-ink sm:px-7 sm:pb-6 sm:pt-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="voice-display min-w-0 pt-1 text-[1.875rem] sm:text-[2.125rem]">
            <span className="sr-only">Adjust stock: </span>
            {product.name}
          </h2>
          <button
            type="button"
            onClick={onDone}
            aria-label="Close"
            className="press grid size-10 shrink-0 place-items-center rounded-full text-board-ink-2 hover:bg-board-deep hover:text-board-ink"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        <div role="group" aria-label="Kind of change" className="board-well mt-4 grid grid-cols-4 rounded-full p-1">
          {STOCK_ACTIONS.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={action === a.id}
              onClick={() => switchAction(a.id)}
              className={`press rounded-full px-2 py-1.5 text-[0.875rem] font-semibold whitespace-nowrap ${
                action === a.id ? "bg-card text-card-ink shadow-[0_1px_3px_oklch(0_0_0/0.3)]" : "text-board-ink-2 hover:text-board-ink"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-5 pt-5 sm:px-7 sm:pb-7">
        {live.length === 0 ? (
          <p className="text-[0.9375rem] text-ink-2">This product has no visible sizes or colors to adjust. Add them by editing the product.</p>
        ) : (
          <>
            <p className="text-[0.9375rem] font-semibold text-ink">{info.prompt}</p>
            <p className="mt-0.5 text-[0.8125rem] text-ink-2">
              {action === "recount"
                ? "Change only the sizes you counted. The difference is logged as a correction."
                : "Leave a size empty to skip it."}
            </p>

            <div className="mt-4 flex flex-col gap-5">
              {colors.map((color) => (
                <div key={color}>
                  <p className="mb-2 text-[0.9375rem] font-semibold text-ink">{color}</p>
                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(3.75rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
                    {sizes.map((size) => {
                      const v = cellFor(size, color);
                      if (!v) return null;
                      const c = changes.find((x) => x.variant.id === v.id);
                      const err = invalid[v.id] ?? failed[v.id];
                      return (
                        <li key={v.id} className="flex min-w-0 flex-col gap-1">
                          <label htmlFor={`adj-${v.id}`} className="flex items-baseline justify-between text-[0.75rem]">
                            <span className="voice-label text-ink">{size}</span>
                            <span className="tabular text-ink-2" title="Now">
                              {v.stock_quantity}
                            </span>
                          </label>
                          <div className={`auth-input flex h-11 items-center ${err ? "is-error" : ""}`}>
                            <span aria-hidden="true" className="pl-2.5 text-[0.9375rem] font-semibold text-ink-2">
                              {info.sign}
                            </span>
                            <input
                              id={`adj-${v.id}`}
                              inputMode="numeric"
                              value={shown(v)}
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^\d]/g, "");
                                setTyped((t) => ({ ...t, [v.id]: val }));
                                if (failed[v.id]) setFailed((f) => withoutKey(f, v.id));
                              }}
                              onFocus={(e) => e.target.select()}
                              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), save())}
                              aria-label={`${color} ${size}, now ${v.stock_quantity}. ${info.prompt}`}
                              aria-invalid={!!err || undefined}
                              className="voice-board tabular h-full w-full min-w-0 bg-transparent pl-1 pr-2 text-[1.25rem] outline-none placeholder:text-ink-2"
                            />
                          </div>
                          <p className={`tabular min-h-[1rem] text-[0.75rem] leading-tight ${err ? "font-semibold text-ink" : "text-ink-2"}`}>
                            {err ?? (c ? `${c.now} → ${c.next}` : "")}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>

            <fieldset className="mt-6">
              <legend className="mb-2 text-[0.9375rem] font-semibold text-ink">Reason</legend>
              <div className="flex flex-wrap gap-1.5">
                {info.reasons.map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={pick === r}
                    onClick={() => setPick(r)}
                    className={`press h-9 rounded-full px-3.5 text-[0.875rem] font-semibold ${
                      pick === r ? "bg-ink text-ground" : "text-ink-2 shadow-[inset_0_0_0_1px_var(--line)] hover:text-ink"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <label htmlFor="adj-note" className="sr-only">
                Note
              </label>
              <input
                id="adj-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={MAX_NOTE}
                placeholder={info.notePlaceholder}
                className="auth-input mt-3 px-4 text-[0.9375rem]"
              />
            </fieldset>

            {message && (
              <p
                role={message.tone === "error" ? "alert" : "status"}
                className={`mt-5 flex items-start gap-2.5 rounded-xl px-4 py-3 text-[0.9375rem] ${
                  message.tone === "error" ? "auth-alert" : "bg-ground-2 font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)]"
                }`}
              >
                {message.tone === "ok" && <CircleCheck aria-hidden="true" className="mt-0.5 size-[1.125rem] shrink-0 text-board-text" />}
                {message.text}
              </p>
            )}

            <div className="sticky bottom-0 z-[1] -mx-5 mt-6 flex flex-col gap-3 border-t border-line bg-ground px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:static sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:border-0 sm:bg-transparent sm:p-0">
              <p className="text-[0.875rem] text-ink-2" aria-live="polite">
                {Object.keys(invalid).length > 0 ? (
                  <span className="font-semibold text-ink">
                    {Object.keys(invalid).length} {Object.keys(invalid).length === 1 ? "size needs" : "sizes need"} fixing
                  </span>
                ) : valid.length === 0 ? (
                  "No changes yet"
                ) : (
                  <>
                    <span className="voice-board tabular text-[1.125rem] text-ink">{valid.length}</span>{" "}
                    {valid.length === 1 ? "size" : "sizes"} ·{" "}
                    <span className="voice-board tabular text-[1.125rem] text-ink">
                      {net > 0 ? "+" : net < 0 ? "−" : ""}
                      {Math.abs(net)}
                    </span>{" "}
                    {Math.abs(net) === 1 ? "piece" : "pieces"}
                  </>
                )}
              </p>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={onDone}
                  className="press inline-flex h-11 flex-1 items-center justify-center rounded-xl px-4 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2 sm:flex-none"
                >
                  {message?.tone === "ok" ? "Done" : "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={!canSave}
                  className="press inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-board px-5 text-[0.9375rem] font-semibold text-board-ink hover:bg-board-deep disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                >
                  {saving && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
                  {saving ? "Saving…" : info.save}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function withoutKey(obj: Record<string, string>, key: string) {
  const next = { ...obj };
  delete next[key];
  return next;
}
