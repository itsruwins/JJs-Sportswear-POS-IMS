"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Check, ImagePlus, LoaderCircle, RotateCcw, Trash2, X } from "lucide-react";
import {
  acceptOrder,
  addPhoto,
  backToProduction,
  cancelOrder,
  completeOrder,
  declineOrder,
  markReady,
  removePhoto,
  reprintOrder,
  savePrice,
  setStep,
  type OrderResult,
} from "@/app/admin/orders/actions";
import { prepareForUpload } from "@/components/admin/products/photo-picker";
import { formatPeso } from "@/lib/admin/catalog";
import { downPayment, STEPS, type OrderStatus, type Step } from "@/lib/admin/orders";
import { createClient } from "@/lib/supabase/client";

const green = "press inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-board px-5 text-[0.9375rem] font-semibold text-board-ink hover:bg-board-deep disabled:opacity-50";
const outline = "press inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2 disabled:opacity-50";
const inkBtn = "press inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-ink px-5 text-[0.9375rem] font-semibold text-ground hover:opacity-90 disabled:opacity-50";

// A status move unmounts the panel that started it (Accept, Hand over, Cancel…), so outcomes are
// announced in one page-level line instead: <OrderFlash> at the top of the order page.
type Flash = { key: number; orderId: string; text: string; tone: "done" | "problem" };
let flash: Flash | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
function announce(orderId: string, text: string, tone: Flash["tone"] = "done") {
  flash = { key: Date.now(), orderId, text, tone };
  listeners.forEach((l) => l());
}

/** The order page's outcome line: announced to screen readers and focused, so nothing is lost when a panel goes away. */
export function OrderFlash({ orderId }: { orderId: string }) {
  const current = useSyncExternalStore(subscribe, () => flash, () => null);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const shown = current && current.orderId === orderId && current.key !== dismissed ? current : null;
  const key = shown?.key;
  useEffect(() => {
    if (!key) return;
    const frame = requestAnimationFrame(() => ref.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [key]);
  return (
    <div role="status" aria-live="polite">
      {shown && (
        <div
          key={shown.key}
          ref={ref}
          tabIndex={-1}
          className={`mt-6 flex items-start justify-between gap-4 rounded-xl px-4 py-3 text-[0.9375rem] outline-none ${
            shown.tone === "problem" ? "auth-alert" : "bg-ground-2 font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)]"
          }`}
        >
          <p>{shown.text}</p>
          <button type="button" onClick={() => setDismissed(shown.key)} aria-label="Dismiss" className="press -m-1 grid size-7 shrink-0 place-items-center rounded-full text-ink-2 hover:text-ink">
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Runs one order action and refreshes the page after. Successes go to the page-level line;
 * problems show in place. While it runs, buttons stay focusable (aria-disabled) and repeat taps
 * are ignored, so keyboard focus never drops to the page. `quiet` is for dialogs, which show
 * their own errors.
 */
export function useAction(orderId: string) {
  const router = useRouter();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<OrderResult | null>(null);
  const run = async (key: string, fn: () => Promise<OrderResult>, opts: { quiet?: boolean } = {}): Promise<OrderResult> => {
    if (busyRef.current) return { ok: false, message: "" };
    busyRef.current = true;
    setBusy(key);
    setResult(null);
    try {
      const r = await fn();
      const stale = !r.ok && "stale" in r && r.stale;
      if (r.ok && r.message) announce(orderId, r.message);
      else if (stale && opts.quiet) announce(orderId, r.message, "problem");
      else if (!r.ok && !opts.quiet) setResult(r);
      if (r.ok || stale) router.refresh();
      return r;
    } catch {
      const r: OrderResult = { ok: false, message: "We couldn’t reach the server. Check your connection and try again." };
      if (!opts.quiet) setResult(r);
      return r;
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };
  return { busy, result, run };
}

/** A problem with the action right here. */
export function Outcome({ result }: { result: OrderResult | null }) {
  return (
    <div role="alert">
      {result && !result.ok && result.message && <p className="auth-alert mt-3 rounded-xl px-4 py-3 text-[0.9375rem]">{result.message}</p>}
    </div>
  );
}

/** A confirmation that needs a short written reason (decline, cancel, reprint). */
export function ReasonDialog({
  open,
  title,
  body,
  label,
  placeholder,
  confirm,
  maxLength = 500,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  label: string;
  placeholder: string;
  confirm: string;
  /** The same limit the server keeps (300 for production notes, 500 for messages to the customer). */
  maxLength?: number;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<OrderResult>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const busyRef = useRef(false);
  const fieldId = useId();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  const submit = async () => {
    if (busyRef.current || reason.trim().length < 3) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    const r = await onConfirm(reason);
    busyRef.current = false;
    setBusy(false);
    if (r.ok || ("stale" in r && r.stale)) {
      setReason("");
      onClose();
    } else setError(r.message);
  };

  return (
    <dialog
      ref={ref}
      className="auth-dialog"
      aria-labelledby={`${fieldId}-title`}
      onCancel={(e) => busyRef.current && e.preventDefault()}
      onClose={() => {
        if (busyRef.current) ref.current?.showModal();
        else if (open) onClose();
      }}
    >
      <form
        className="auth-sheet px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-7 sm:pb-7"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 id={`${fieldId}-title`} className="voice-display text-[1.875rem]">
          {title}
        </h2>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-2">{body}</p>
        <label htmlFor={fieldId} className="mt-5 block text-[0.875rem] font-semibold text-ink">
          {label}
        </label>
        <textarea
          id={fieldId}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={maxLength}
          rows={3}
          placeholder={placeholder}
          className="auth-input auth-input-grow mt-2 min-h-24 resize-none px-4 py-3 leading-relaxed"
        />
        {error && (
          <p role="alert" className="auth-alert mt-4 rounded-xl px-4 py-3 text-[0.9375rem]">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => ref.current?.close()} disabled={busy} className={outline}>
            Go back
          </button>
          <button type="submit" disabled={busy || reason.trim().length < 3} className={inkBtn}>
            {busy && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
            {confirm}
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** New orders: set the price and accept, or decline with a reason. Accepted orders: the price can still change. */
export function ReviewPanel({ id, status, price }: { id: string; status: OrderStatus; price: number | null }) {
  const priceId = useId();
  const { busy, result, run } = useAction(id);
  const [value, setValue] = useState(price !== null ? String(price) : "");
  const [declining, setDeclining] = useState(false);
  const amount = Number(value.replace(/[^\d.]/g, ""));
  const valid = Number.isFinite(amount) && amount > 0;

  return (
    <div>
      <label htmlFor={priceId} className="text-[0.875rem] font-semibold text-ink">
        Total price
      </label>
      <div className="relative mt-1.5 max-w-[16rem]">
        <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[1rem] text-ink-2">
          ₱
        </span>
        <input
          id={priceId}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ""))}
          aria-describedby={`${priceId}-hint`}
          className="auth-input tabular pl-9 pr-4 text-[1.125rem]"
        />
      </div>
      <p id={`${priceId}-hint`} className="mt-1.5 text-[0.8125rem] text-ink-2">
        {valid ? `Down payment (50%): ${formatPeso(downPayment(amount))}` : "The whole order, all items. The down payment is half."}
      </p>

      <div className="mt-4 flex flex-wrap gap-2.5">
        {status === "pending" ? (
          <>
            <button type="button" disabled={!valid} aria-disabled={!!busy} onClick={() => run("accept", () => acceptOrder(id, amount))} className={green}>
              {busy === "accept" ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Check aria-hidden="true" className="size-4" strokeWidth={2.5} />}
              Accept order
            </button>
            <button type="button" aria-disabled={!!busy} onClick={() => setDeclining(true)} className={outline}>
              Decline
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={!valid || amount === price} aria-disabled={!!busy}
            onClick={() => run("price", () => savePrice(id, status, amount))}
            className={outline}
          >
            {busy === "price" && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
            Save price
          </button>
        )}
      </div>
      <Outcome result={result} />

      <ReasonDialog
        open={declining}
        title="Decline this order?"
        body="The customer sees your reason with the order. Declined orders can’t be reopened; they can place a new one."
        label="Why can’t the shop take it?"
        placeholder="For example: we can’t print metallic ink yet, but can do a matte gold."
        confirm="Decline order"
        onClose={() => setDeclining(false)}
        onConfirm={(reason) => run("decline", () => declineOrder(id, reason), { quiet: true })}
      />
    </div>
  );
}

/** The production checklist: tick each step as it's done; a failed inspection sends it back to printing. */
export function ProductionChecklist({
  id,
  status,
  steps,
  locked = false,
  readOnly = false,
}: {
  id: string;
  status: OrderStatus;
  steps: Partial<Record<Step, { done_at: string; by: string; when: string }>>;
  /** Waiting for the down payment: production can't start yet. */
  locked?: boolean;
  /** Staff follow production; only the owner ticks steps. */
  readOnly?: boolean;
}) {
  const { busy, result, run } = useAction(id);
  const [reprinting, setReprinting] = useState(false);
  const editable = !readOnly && (status === "accepted" || status === "in_progress");
  const done = STEPS.filter((s) => steps[s.id]).length;
  // Steps go in order: only the next one can be ticked, and only the last done one unticked.
  const next = STEPS.findIndex((s) => !steps[s.id]);
  const nextIndex = next === -1 ? STEPS.length : next;

  return (
    <div>
      <ol className="flex flex-col gap-1.5">
        {STEPS.map((s, i) => {
          const d = steps[s.id];
          const tappable = editable && !locked && (i === nextIndex || i === nextIndex - 1);
          return (
            <li key={s.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={!!d}
                disabled={!tappable} aria-disabled={!!busy}
                onClick={() => run(s.id, () => setStep(id, s.id, !d))}
                className="press flex w-full items-center gap-3.5 rounded-xl px-3 py-2.5 text-left shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2 disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span
                  aria-hidden="true"
                  className={`grid size-7 shrink-0 place-items-center rounded-full text-[0.8125rem] font-semibold ${
                    d ? "bg-ink text-ground" : "text-ink-2 shadow-[inset_0_0_0_1.5px_var(--line)]"
                  }`}
                >
                  {busy === s.id ? <LoaderCircle className="size-4 animate-spin" /> : d ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-semibold text-ink">{s.label}</span>
                  <span className={`block text-[0.8125rem] ${!d && tappable ? "font-semibold text-ink" : "text-ink-2"}`}>
                    {d ? `Done ${d.when} · ${d.by}` : tappable ? "Tap when done" : "Not done yet"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {editable && status === "accepted" && !locked && <p className="mt-3 text-[0.875rem] text-ink-2">Ticking the first step starts production and tells the customer.</p>}

      {editable && status === "in_progress" && (
        <div className="mt-4 flex flex-wrap gap-2.5">
          <button type="button" disabled={done < 5} aria-disabled={!!busy} onClick={() => run("ready", () => markReady(id))} className={green}>
            {busy === "ready" && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
            Mark ready for pickup
          </button>
          {/* Inspection only happens once the pieces are sewn. */}
          {steps.sewing && (
            <button type="button" aria-disabled={!!busy} onClick={() => setReprinting(true)} className={outline}>
              <RotateCcw aria-hidden="true" className="size-4" />
              Failed inspection: reprint
            </button>
          )}
        </div>
      )}
      {status === "in_progress" && done < 5 && <p className="mt-2 text-[0.8125rem] text-ink-2">Ready for pickup once all five steps are done ({done}/5).</p>}
      <Outcome result={result} />

      <ReasonDialog
        open={reprinting}
        title="Send back for a reprint?"
        body="Production starts over from printing; the history keeps a note of why."
        label="What failed inspection?"
        placeholder="For example: logo print smudged on six shirts."
        confirm="Send back to printing"
        maxLength={300}
        onClose={() => setReprinting(false)}
        onConfirm={(reason) => run("reprint", () => reprintOrder(id, reason), { quiet: true })}
      />
    </div>
  );
}

/** Ready orders: hand over, or reopen production (with what needs fixing) if something turns up. */
export function HandoverPanel({ id, balanceDue = 0 }: { id: string; balanceDue?: number }) {
  const { busy, result, run } = useAction(id);
  const [reopening, setReopening] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap gap-2.5">
        <button type="button" disabled={balanceDue > 0} aria-disabled={!!busy} onClick={() => run("complete", () => completeOrder(id))} className={green}>
          {busy === "complete" ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Check aria-hidden="true" className="size-4" strokeWidth={2.5} />}
          Picked up: complete order
        </button>
        <button type="button" aria-disabled={!!busy} onClick={() => setReopening(true)} className={outline}>
          Back to production
        </button>
      </div>
      <Outcome result={result} />
      <ReasonDialog
        open={reopening}
        title="Back to production?"
        body="The order leaves Ready. The customer is told it needs a little more work, and the history keeps your note."
        label="What needs fixing?"
        placeholder="For example: two jerseys have the wrong number."
        confirm="Back to production"
        maxLength={300}
        onClose={() => setReopening(false)}
        onConfirm={(reason) => run("back", () => backToProduction(id, reason), { quiet: true })}
      />
    </div>
  );
}

export function CancelOrderButton({ id }: { id: string }) {
  const { busy, result, run } = useAction(id);
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" aria-disabled={!!busy} onClick={() => setOpen(true)} className="press rounded-full px-1 py-1 text-[0.875rem] font-semibold text-ink-2 underline underline-offset-2 hover:text-ink">
        Cancel this order
      </button>
      <Outcome result={result} />
      <ReasonDialog
        open={open}
        title="Cancel this order?"
        body="The customer is told, with your reason. A cancelled order can’t be reopened. If a down payment was made, settle it with the customer."
        label="Why is it cancelled?"
        placeholder="For example: the customer asked to cancel over chat."
        confirm="Cancel order"
        onClose={() => setOpen(false)}
        onConfirm={(reason) => run("cancel", () => cancelOrder(id, reason), { quiet: true })}
      />
    </div>
  );
}

/** Up to four photos of the finished order. The customer sees them with their order. */
export function PhotoManager({ id, photos, canEdit }: { id: string; photos: { id: string; url: string | null }[]; canEdit: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { busy, result, run } = useAction(id);
  const [confirming, setConfirming] = useState<string | null>(null);
  // Each refresh signs fresh links; keep the first one per photo so the image isn't downloaded again.
  const [urls, setUrls] = useState<Record<string, string>>({});
  const fresh = photos.filter((p) => p.url && !urls[p.id]);
  if (fresh.length) setUrls((u) => ({ ...u, ...Object.fromEntries(fresh.map((p) => [p.id, p.url!])) }));
  const room = 4 - photos.length;

  const upload = async (files: FileList | null) => {
    const list = [...(files ?? [])].slice(0, room);
    if (!list.length) return;
    await run("upload", async () => {
      const supabase = createClient();
      let saved = 0;
      // Once one photo is saved, a later failure still refreshes the page (stale) so it shows.
      const fail = (message: string): OrderResult => ({ ok: false, message, stale: saved > 0 });
      for (const file of list) {
        let prepared: Awaited<ReturnType<typeof prepareForUpload>>;
        try {
          prepared = await prepareForUpload(file);
        } catch (e) {
          return fail(e instanceof Error && e.message ? e.message : "That file couldn’t be read. Use a JPG, PNG, or WebP photo.");
        }
        const path = `${id}/${crypto.randomUUID()}.${prepared.ext}`;
        const { error } = await supabase.storage.from("order-photos").upload(path, prepared.blob, { contentType: prepared.type, upsert: false });
        if (error) return fail("A photo didn’t upload. Check the file (JPG, PNG, or WebP up to 10 MB) and try again.");
        const r = await addPhoto(id, path);
        if (!r.ok) return fail(r.message);
        saved += 1;
      }
      return { ok: true, message: saved === 1 ? "Photo added. The customer can see it." : `${saved} photos added. The customer can see them.` };
    });
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      {photos.length === 0 && !canEdit ? (
        <p className="text-[0.9375rem] text-ink-2">No photos.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {photos.map((p, i) => {
            const src = urls[p.id] ?? p.url;
            const asking = confirming === p.id;
            return (
              <li key={p.id} className="relative aspect-square overflow-hidden rounded-2xl bg-[var(--photo-bg)] shadow-[inset_0_0_0_1px_var(--line)]">
                {src ? (
                  // Signed links from a private bucket, so a plain image rather than an optimized one.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt={`Finished order, photo ${i + 1}`} className="size-full object-cover" />
                ) : (
                  <span className="grid size-full place-items-center text-[0.8125rem] text-ink-2">Unavailable</span>
                )}
                {canEdit && (
                  // Two taps: the customer sees these photos, so removing one asks first.
                  <button
                    type="button"
                    aria-disabled={!!busy}
                    onClick={() => (asking ? run(`rm-${p.id}`, () => removePhoto(id, p.id)) : setConfirming(p.id))}
                    onBlur={() => asking && setConfirming(null)}
                    aria-label={asking ? `Confirm: remove photo ${i + 1}` : `Remove photo ${i + 1}`}
                    className={`press absolute right-2 top-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-full text-[0.8125rem] font-semibold shadow-[0_2px_8px_-2px_oklch(0.2_0.03_158/0.35)] ${
                      asking ? "bg-ink px-3 text-ground" : "w-9 bg-ground text-ink hover:bg-ground-2"
                    }`}
                  >
                    {busy === `rm-${p.id}` ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Trash2 aria-hidden="true" className="size-4" />}
                    {asking && "Remove?"}
                  </button>
                )}
              </li>
            );
          })}
          {canEdit && room > 0 && (
            <li className="aspect-square">
              <button
                type="button"
                aria-disabled={!!busy}
                onClick={() => inputRef.current?.click()}
                className="press flex size-full flex-col items-center justify-center gap-2 rounded-2xl text-[0.875rem] font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--line)] hover:bg-ground-2"
              >
                {busy === "upload" ? <LoaderCircle aria-hidden="true" className="size-6 animate-spin" /> : <ImagePlus aria-hidden="true" className="size-6" strokeWidth={1.7} />}
                {busy === "upload" ? "Uploading…" : "Add photo"}
                <span className="text-[0.75rem] font-normal text-ink-2">{room} of 4 left</span>
              </button>
            </li>
          )}
        </ul>
      )}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => upload(e.target.files)} />
      <Outcome result={result} />
    </div>
  );
}
