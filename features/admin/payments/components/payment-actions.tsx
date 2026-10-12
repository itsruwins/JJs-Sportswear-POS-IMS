"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Check, ImagePlus, LoaderCircle, Plus, X } from "lucide-react";
import { overrideRule, recordPayment, recordRefund, rejectPayment, verifyPayment } from "@/app/admin/payments/actions";
import { Outcome, ReasonDialog, useAction } from "@/components/admin/orders/order-actions";
import { prepareForUpload } from "@/features/shared/photos/prepare-upload";
import { formatPeso } from "@/features/shared/catalog/catalog";
import type { PayMethod } from "@/lib/admin/payments";
import { formatGcashRef } from "@/lib/admin/sales";
import { createClient } from "@/lib/supabase/client";

const green = "press inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-board px-5 text-[0.9375rem] font-semibold text-board-ink hover:bg-board-deep disabled:opacity-50";
const outline = "press inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2 disabled:opacity-50";
const inkBtn = "press inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-ink px-5 text-[0.9375rem] font-semibold text-ground hover:opacity-90 disabled:opacity-50";
const chip = "press tabular inline-flex h-9 items-center rounded-full px-3 text-[0.875rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2";
const parseAmount = (s: string) => {
  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

function MethodSwitch({ method, onMethod }: { method: PayMethod; onMethod: (m: PayMethod) => void }) {
  return (
    <div role="group" aria-label="How they paid" className="grid grid-cols-2 gap-1 rounded-xl bg-ground-2 p-1 shadow-[inset_0_0_0_1px_var(--line)]">
      {(["cash", "gcash"] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={method === m}
          onClick={() => onMethod(m)}
          className={`press h-10 rounded-lg text-[0.9375rem] font-semibold ${method === m ? "bg-ink text-ground" : "text-ink-2 hover:text-ink"}`}
        >
          {m === "cash" ? "Cash" : "GCash"}
        </button>
      ))}
    </div>
  );
}

/** A native dialog that opens with `open` and stays put while something is saving. */
function useSheet(open: boolean, busy: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  return {
    ref,
    props: {
      onCancel: (e: React.SyntheticEvent) => busyRef.current && e.preventDefault(),
      onClose: () => {
        if (busyRef.current) ref.current?.showModal();
        else if (open) onClose();
      },
    },
  };
}

/** Record money the shop received for an order: cash, or GCash with its reference and an optional screenshot. */
export function RecordPayment({
  orderId,
  customerId,
  due,
  downLeft,
  waiting = 0,
  waitingId = null,
}: {
  orderId: string;
  customerId: string;
  due: number;
  downLeft: number;
  /** Customer payments not yet reviewed; recording more money can leave them unverifiable. */
  waiting?: number;
  waitingId?: string | null;
}) {
  const ids = { amount: useId(), ref: useId(), note: useId() };
  const fileRef = useRef<HTMLInputElement>(null);
  const { run } = useAction(orderId);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PayMethod>("cash");
  const [gcash, setGcash] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const { ref: sheetRef, props: sheetProps } = useSheet(open, busy, () => setOpen(false));
  const value = parseAmount(amount);
  const refDigits = gcash.replace(/\D/g, "");
  // Quick amounts leave out what the customer already sent for review.
  const rest = Math.max(0, Math.round((due - waiting) * 100) / 100);
  const downOpen = Math.max(0, Math.round((downLeft - waiting) * 100) / 100);
  const ready = value > 0 && value <= due && (method === "cash" || refDigits.length === 13);

  const reset = () => {
    setAmount("");
    setMethod("cash");
    setGcash("");
    setNote("");
    setFile(null);
    setError("");
  };

  const save = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    let proofPath: string | null = null;
    if (method === "gcash" && file) {
      try {
        const { blob, ext, type } = await prepareForUpload(file);
        proofPath = `${customerId}/${orderId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await createClient().storage.from("payment-proofs").upload(proofPath, blob, { contentType: type, upsert: false });
        if (upErr) throw new Error("The screenshot didn’t upload. Try again, or record the payment without it.");
      } catch (e) {
        setBusy(false);
        setError(e instanceof Error && e.message ? e.message : "That file couldn’t be read. Use a JPG, PNG, or WebP screenshot.");
        return;
      }
    }
    const r = await run("record", () => recordPayment(orderId, value, method, method === "gcash" ? refDigits : "", proofPath, note), { quiet: true });
    setBusy(false);
    if (r.ok || ("stale" in r && r.stale)) {
      reset();
      setOpen(false);
    } else setError(r.message);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className={green}
      >
        <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} />
        Record a payment
      </button>
      <dialog ref={sheetRef} className="auth-dialog" aria-labelledby={`${ids.amount}-title`} {...sheetProps}>
        <form
          className="auth-sheet px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-7 sm:pb-7"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <h2 id={`${ids.amount}-title`} className="voice-display text-[1.875rem]">
            Record a payment
          </h2>
          <p className="mt-2 text-[0.9375rem] text-ink-2">
            Money the shop has received. It counts as verified straight away, and the customer is told. Still due: <span className="tabular font-semibold text-ink">{formatPeso(due)}</span>.
          </p>
          {waiting > 0 && (
            <p className="mt-3 rounded-xl bg-ground-2 px-4 py-3 text-[0.875rem] text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]">
              The customer also sent <span className="tabular font-semibold text-ink">{formatPeso(waiting)}</span> that’s waiting for review.{" "}
              {waitingId ? (
                <Link href={`/admin/payments/${waitingId}`} className="font-semibold text-ink underline underline-offset-2">
                  Check it first
                </Link>
              ) : (
                "Check it first"
              )}
              , so the same money isn’t counted twice.
            </p>
          )}

          <label htmlFor={ids.amount} className="mt-5 block text-[0.875rem] font-semibold text-ink">
            Amount received
          </label>
          <div className="relative mt-1.5 max-w-[16rem]">
            <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[1rem] text-ink-2">
              ₱
            </span>
            <input
              id={ids.amount}
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
              aria-invalid={value > due || undefined}
              aria-describedby={`${ids.amount}-over`}
              className="auth-input tabular pl-9 pr-4 text-[1.125rem]"
            />
          </div>
          {rest > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {downOpen > 0 && downOpen < rest && (
                <button type="button" onClick={() => setAmount(String(downOpen))} className={chip}>
                  {waiting > 0 ? "Rest of down payment" : "Down payment"} {formatPeso(downOpen)}
                </button>
              )}
              <button type="button" onClick={() => setAmount(String(rest))} className={chip}>
                {waiting > 0 ? "The rest" : downOpen > 0 && downOpen < rest ? "Full amount" : "Balance"} {formatPeso(rest)}
              </button>
            </div>
          )}
          <p id={`${ids.amount}-over`} aria-live="polite" className="mt-1.5 text-[0.8125rem] font-semibold text-ink empty:hidden">
            {value > due ? `That’s more than the ${formatPeso(due)} still due.` : ""}
          </p>

          <p className="mt-5 text-[0.875rem] font-semibold text-ink">How they paid</p>
          <div className="mt-1.5">
            <MethodSwitch method={method} onMethod={setMethod} />
          </div>

          {method === "gcash" && (
            <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div>
                <label htmlFor={ids.ref} className="text-[0.875rem] font-semibold text-ink">
                  GCash reference number
                </label>
                <input
                  id={ids.ref}
                  inputMode="numeric"
                  autoComplete="off"
                  value={formatGcashRef(gcash)}
                  onChange={(e) => setGcash(e.target.value.replace(/\D/g, "").slice(0, 13))}
                  aria-describedby={`${ids.ref}-hint`}
                  className="auth-input tabular mt-1.5 px-4 text-[1.0625rem] tracking-[0.02em]"
                />
                <p id={`${ids.ref}-hint`} className="mt-1 text-[0.8125rem] text-ink-2">
                  13 digits ({refDigits.length}/13)
                </p>
              </div>
              <div className="sm:pb-6">
                <button type="button" onClick={() => fileRef.current?.click()} className={`${outline} h-11`}>
                  <ImagePlus aria-hidden="true" className="size-4" />
                  {file ? "Change screenshot" : "Add screenshot"}
                </button>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
              {file && (
                <p className="flex items-center gap-2 text-[0.8125rem] text-ink-2 sm:col-span-2">
                  <span className="truncate">{file.name}</span>
                  <button type="button" onClick={() => setFile(null)} aria-label="Remove screenshot" className="press grid size-7 place-items-center rounded-full hover:text-ink">
                    <X aria-hidden="true" className="size-4" />
                  </button>
                </p>
              )}
            </div>
          )}

          <label htmlFor={ids.note} className="mt-5 block text-[0.875rem] font-semibold text-ink">
            Note <span className="font-normal text-ink-2">(optional)</span>
          </label>
          <input
            id={ids.note}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="For example: paid by the coach at the counter."
            className="auth-input mt-1.5 px-4"
          />

          {error && (
            <p role="alert" className="auth-alert mt-4 rounded-xl px-4 py-3 text-[0.9375rem]">
              {error}
            </p>
          )}
          <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => sheetRef.current?.close()} className={outline}>
              Go back
            </button>
            <button type="submit" disabled={!ready} aria-disabled={busy} className={green}>
              {busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Check aria-hidden="true" className="size-4" strokeWidth={2.5} />}
              Record {value > 0 ? formatPeso(value) : "payment"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** Verify or reject a payment a customer sent. */
export function ReviewPayment({ paymentId, canVerify = true }: { paymentId: string; canVerify?: boolean }) {
  const { busy, result, run } = useAction(paymentId);
  const [rejecting, setRejecting] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap gap-2.5">
        {canVerify && (
          <button type="button" aria-disabled={!!busy} onClick={() => run("verify", () => verifyPayment(paymentId))} className={green}>
            {busy === "verify" ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Check aria-hidden="true" className="size-4" strokeWidth={2.5} />}
            Verify payment
          </button>
        )}
        <button type="button" aria-disabled={!!busy} onClick={() => !busy && setRejecting(true)} className={outline}>
          Reject
        </button>
      </div>
      <Outcome result={result} />
      <ReasonDialog
        open={rejecting}
        title="Reject this payment?"
        body="The customer sees your reason and can send it again. Rejecting doesn’t change the order."
        label="What’s wrong with it?"
        placeholder="For example: the reference number isn’t in our GCash history."
        confirm="Reject payment"
        maxLength={300}
        onClose={() => setRejecting(false)}
        onConfirm={(reason) => run("reject", () => rejectPayment(paymentId, reason), { quiet: true })}
      />
    </div>
  );
}

/** Owner: record money given back on a cancelled order. */
export function RecordRefund({ orderId, left }: { orderId: string; left: number }) {
  const ids = { amount: useId(), note: useId() };
  const { run } = useAction(orderId);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState(String(left));
  const [method, setMethod] = useState<PayMethod>("cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const { ref: sheetRef, props: sheetProps } = useSheet(open, busy, () => setOpen(false));
  const value = parseAmount(amount);
  const ready = value > 0 && value <= left && note.trim().length >= 3;

  const save = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    const r = await run("refund", () => recordRefund(orderId, value, method, note), { quiet: true });
    setBusy(false);
    if (r.ok || ("stale" in r && r.stale)) setOpen(false);
    else setError(r.message);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // Start from what's left now, not what was left when the page first loaded.
          setAmount(String(left));
          setNote("");
          setError("");
          setOpen(true);
        }}
        className={outline}
      >
        Record a refund
      </button>
      <dialog ref={sheetRef} className="auth-dialog" aria-labelledby={`${ids.amount}-title`} {...sheetProps}>
        <form
          className="auth-sheet px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-7 sm:pb-7"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <h2 id={`${ids.amount}-title`} className="voice-display text-[1.875rem]">
            Record a refund
          </h2>
          <p className="mt-2 text-[0.9375rem] text-ink-2">
            Money given back on this cancelled order. Up to <span className="tabular font-semibold text-ink">{formatPeso(left)}</span>, what’s left of what they paid.
          </p>
          <label htmlFor={ids.amount} className="mt-5 block text-[0.875rem] font-semibold text-ink">
            Amount given back
          </label>
          <div className="relative mt-1.5 max-w-[16rem]">
            <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[1rem] text-ink-2">
              ₱
            </span>
            <input
              id={ids.amount}
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
              aria-invalid={value > left || undefined}
              aria-describedby={`${ids.amount}-over`}
              className="auth-input tabular pl-9 pr-4 text-[1.125rem]"
            />
          </div>
          <p id={`${ids.amount}-over`} aria-live="polite" className="mt-1.5 text-[0.8125rem] font-semibold text-ink empty:hidden">
            {value > left ? `That’s more than the ${formatPeso(left)} left to give back.` : ""}
          </p>
          <p className="mt-5 text-[0.875rem] font-semibold text-ink">How it was given back</p>
          <div className="mt-1.5">
            <MethodSwitch method={method} onMethod={setMethod} />
          </div>
          <label htmlFor={ids.note} className="mt-5 block text-[0.875rem] font-semibold text-ink">
            Note
          </label>
          <input
            id={ids.note}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="For example: sent back to the customer’s GCash."
            aria-describedby={`${ids.note}-hint`}
            className="auth-input mt-1.5 px-4"
          />
          <p id={`${ids.note}-hint`} className="mt-1 text-[0.8125rem] text-ink-2">
            Required. The customer is told the amount; the note stays in the order’s history.
          </p>
          {error && (
            <p role="alert" className="auth-alert mt-4 rounded-xl px-4 py-3 text-[0.9375rem]">
              {error}
            </p>
          )}
          <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => sheetRef.current?.close()} className={outline}>
              Go back
            </button>
            <button type="submit" disabled={!ready} aria-disabled={busy} className={inkBtn}>
              {busy && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
              Record refund
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** Owner: let an order start production, or be picked up, before it's paid enough. */
export function PaymentException({ orderId, kind }: { orderId: string; kind: "production" | "pickup" }) {
  const { busy, result, run } = useAction(orderId);
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        aria-disabled={!!busy}
        onClick={() => setOpen(true)}
        className="press rounded-full px-1 py-1 text-[0.875rem] font-semibold text-ink underline underline-offset-2 hover:decoration-2"
      >
        {kind === "production" ? "Owner: start without the down payment…" : "Owner: release without full payment…"}
      </button>
      <Outcome result={result} />
      <ReasonDialog
        open={open}
        title={kind === "production" ? "Start production before the down payment?" : "Release before it’s paid in full?"}
        body={
          kind === "production"
            ? "Production can start even though the down payment isn’t in yet. The history keeps your note; the payments still show what’s due."
            : "The order can be picked up with a balance still due. The history keeps your note; the payments still show what’s owed."
        }
        label="Why the exception?"
        placeholder={kind === "production" ? "For example: the school pays by voucher next week." : "For example: the coach will settle the balance on Friday."}
        confirm={kind === "production" ? "Allow production" : "Allow pickup"}
        maxLength={300}
        onClose={() => setOpen(false)}
        onConfirm={(reason) => run("override", () => overrideRule(orderId, kind, reason), { quiet: true })}
      />
    </div>
  );
}
