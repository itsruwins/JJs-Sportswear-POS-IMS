"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ImagePlus, LoaderCircle, X } from "lucide-react";
import { prepareForUpload } from "@/features/shared/photos/prepare-upload";
import { formatPeso } from "@/features/shared/catalog/catalog";
import type { Money } from "@/features/customer/orders/model";
import { createClient } from "@/lib/supabase/client";
import { submitPayment } from "@/features/customer/orders/actions";

export type GcashInfo = { name: string | null; number: string | null; qr: string | null };

const label = "text-[0.9375rem] font-semibold text-ink";
const errorText = "mt-2 text-[0.875rem] font-semibold text-ink";

/** Pesos with thousands grouped, as the chips and button show them ("4,875"). */
const groupAmount = (n: number) => n.toLocaleString("en-PH", { maximumFractionDigits: 2 });

/** "0917 123 4567"-style grouping for a GCash reference: 4-3-6, like the receipt. */
const groupRef = (digits: string) => [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 13)].filter(Boolean).join(" ");

/**
 * Pay with GCash, in a modal (bottom sheet on phones): the shop's GCash details, how much
 * (chips for the rest of the down payment or the whole balance), the 13-digit reference,
 * and a screenshot of the receipt. The draft stays while the modal is closed, and it
 * can't close mid-upload or mid-send.
 */
export function PayModal({
  orderId,
  orderNumber,
  uid,
  money,
  gcash,
  trigger,
  tone = "board",
}: {
  orderId: string;
  orderNumber: string;
  uid: string;
  money: Money;
  gcash: GcashInfo;
  trigger: string;
  tone?: "board" | "outline";
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const ids = { title: useId(), amount: useId(), ref: useId(), proof: useId() };
  const suggested = money.downLeft > 0 ? money.downLeft : money.left;
  const [amount, setAmount] = useState(groupAmount(suggested));
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState<{ path: string; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<"amount" | "reference" | "proof" | "form", string>>>({});
  const [sent, setSent] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const busy = uploading || sending;

  const value = Number(amount.replace(/[^\d.]/g, "")) || 0;
  const fields = useRef<Partial<Record<"amount" | "reference" | "proof", HTMLElement | null>>>({});
  /** After a failed send, take the customer to the first field with a problem (the sheet may have scrolled past it). */
  const focusFirst = (found: Partial<Record<string, string | undefined>>) => {
    const first = (["amount", "reference", "proof"] as const).find((k) => found[k]);
    if (!first) return;
    requestAnimationFrame(() => {
      const el = fields.current[first];
      el?.scrollIntoView({ block: "center" });
      el?.focus();
    });
  };
  const digits = reference.replace(/\D/g, "").slice(0, 13);

  const open = () => {
    setErrors({});
    if (sent !== null) {
      // A fresh payment after one was sent.
      setSent(null);
      setReference("");
      setProof(null);
      setAmount(groupAmount(suggested));
    }
    dialog.current?.showModal();
  };
  const close = () => {
    if (!busy) dialog.current?.close();
  };

  const pickProof = async (file: File | undefined) => {
    if (!file) return;
    setErrors((e) => ({ ...e, proof: undefined }));
    setUploading(true);
    try {
      const { blob, ext, type } = await prepareForUpload(file);
      const path = `${uid}/${orderId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await createClient().storage.from("payment-proofs").upload(path, blob, { contentType: type });
      if (error) throw new Error("The screenshot didn’t upload. Check your connection and try again.");
      setProof({ path, url: URL.createObjectURL(blob) });
    } catch (e) {
      setErrors((x) => ({ ...x, proof: e instanceof Error ? e.message : "The screenshot didn’t upload. Try again." }));
    } finally {
      setUploading(false);
    }
  };

  const send = async () => {
    const found: typeof errors = {};
    if (value <= 0) found.amount = "Enter how much you sent.";
    else if (value > money.left) found.amount = `That’s more than the ${formatPeso(money.left)} still to pay.`;
    if (digits.length !== 13) found.reference = "Enter the 13-digit reference number from your GCash receipt.";
    if (!proof) found.proof = "Add a screenshot of your GCash receipt, so the shop can match it.";
    setErrors(found);
    if (Object.keys(found).length) return focusFirst(found);

    setSending(true);
    const result = await submitPayment(orderId, value, digits, proof!.path);
    setSending(false);
    if (!result.ok) {
      const found = { [result.field ?? "form"]: result.message };
      setErrors(found);
      focusFirst(found);
      return;
    }
    setSent(value);
    router.refresh();
  };

  const copyNumber = async () => {
    if (!gcash.number) return;
    try {
      await navigator.clipboard.writeText(gcash.number.replace(/\s/g, ""));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be blocked; the number is on screen to copy by hand.
    }
  };

  const chips = [
    money.downLeft > 0 && money.downLeft < money.left
      ? { label: money.paid + money.waiting > 0 ? "Rest of the down payment" : "Down payment", value: money.downLeft }
      : null,
    { label: money.paid + money.waiting > 0 ? "Everything still due" : "Full amount", value: money.left },
  ].filter((c): c is { label: string; value: number } => Boolean(c));

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={
          tone === "board"
            ? "press inline-flex h-12 items-center justify-center rounded-full bg-board px-6 text-[0.9375rem] font-semibold text-board-ink hover:bg-board-deep"
            : "press inline-flex h-11 items-center justify-center rounded-full px-5 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--ink)] hover:bg-ground-2"
        }
      >
        {trigger}
      </button>

      <dialog
        ref={dialog}
        className="auth-dialog"
        aria-labelledby={ids.title}
        onCancel={(e) => busy && e.preventDefault()}
        onClick={(e) => e.target === e.currentTarget && close()}
      >
        <div className="auth-sheet px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-7 sm:pb-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={ids.title} className="voice-display text-[1.875rem]">
                {sent !== null ? "Payment sent" : "Pay with GCash"}
              </h2>
              <p className="tabular mt-1 text-[0.875rem] text-ink-2">{orderNumber}</p>
            </div>
            <button type="button" onClick={close} disabled={busy} className="press -mr-2 -mt-1 grid size-10 place-items-center rounded-full text-ink-2 hover:bg-ground-2 hover:text-ink disabled:opacity-50">
              <X aria-hidden="true" className="size-5" />
              <span className="sr-only">Close</span>
            </button>
          </div>

          {sent !== null ? (
            <div className="mt-5">
              <p className="text-[1rem] leading-relaxed text-ink">
                The shop will check your <span className="tabular font-semibold">{formatPeso(sent)}</span> GCash payment against its
                account and mark it verified. You’ll see it on this order.
              </p>
              <button
                type="button"
                onClick={close}
                data-autofocus
                className="press mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-ink px-5 text-[1rem] font-semibold text-ground hover:opacity-90"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* 1. Where to send it */}
              <div className="mt-5 flex items-center gap-4 rounded-2xl bg-ground-2 p-4 shadow-[inset_0_0_0_1px_var(--line)]">
                {gcash.qr && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={gcash.qr} alt="The shop’s GCash QR code" className="size-24 shrink-0 rounded-xl bg-white object-contain p-1" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[0.8125rem] text-ink-2">Send to J&amp;J Sportswear’s GCash</p>
                  <p className={`mt-0.5 text-[1rem] font-semibold ${gcash.name ? "text-ink" : "text-ink-2"}`}>{gcash.name ?? "Account name to follow"}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className={`tabular text-[1.125rem] font-semibold ${gcash.number ? "text-ink" : "text-ink-2"}`}>{gcash.number ?? "Number to follow"}</p>
                    {gcash.number && (
                      <button type="button" onClick={copyNumber} className="press inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[0.8125rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground">
                        {copied ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}
                        {copied ? "Copied" : "Copy"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {(!gcash.name || !gcash.number) && (
                <p className="mt-2 text-[0.8125rem] text-ink-2">The shop’s GCash details go here once they’re confirmed.</p>
              )}

              {/* 2. How much */}
              <div className="mt-6">
                <label htmlFor={ids.amount} className={label}>
                  Amount you sent
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {chips.map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      aria-pressed={value === c.value}
                      onClick={() => {
                        setAmount(groupAmount(c.value));
                        setErrors((e) => ({ ...e, amount: undefined }));
                      }}
                      className="shop-chip press tabular h-9 text-[0.875rem]"
                    >
                      {c.label} · {formatPeso(c.value)}
                    </button>
                  ))}
                </div>
                <div className={`auth-input mt-2.5 flex items-center gap-2 px-4 ${errors.amount ? "is-error" : ""}`}>
                  <span aria-hidden="true" className="text-ink-2">
                    ₱
                  </span>
                  <input
                    id={ids.amount}
                    ref={(el) => {
                      fields.current.amount = el;
                    }}
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value.replace(/[^\d.,]/g, ""));
                      setErrors((x) => ({ ...x, amount: undefined }));
                    }}
                    onBlur={() => value > 0 && setAmount(groupAmount(value))}
                    aria-invalid={Boolean(errors.amount)}
                    aria-describedby={`${ids.amount}-hint`}
                    className="tabular h-full min-w-0 flex-1 bg-transparent text-[1.0625rem] font-semibold outline-none"
                  />
                </div>
                <p id={`${ids.amount}-hint`} className={errors.amount ? errorText : "mt-1.5 text-[0.8125rem] text-ink-2"}>
                  {errors.amount ??
                    (money.downLeft > 0
                      ? `At least ${formatPeso(money.downLeft)} completes the down payment; ${formatPeso(money.left)} pays it all.`
                      : `${formatPeso(money.left)} is still to pay.`)}
                </p>
              </div>

              {/* 3. Proof */}
              <div className="mt-6">
                <label htmlFor={ids.ref} className={label}>
                  GCash reference number
                </label>
                <input
                  id={ids.ref}
                  ref={(el) => {
                    fields.current.reference = el;
                  }}
                  inputMode="numeric"
                  autoComplete="off"
                  value={groupRef(digits)}
                  onChange={(e) => {
                    setReference(e.target.value.replace(/\D/g, "").slice(0, 13));
                    setErrors((x) => ({ ...x, reference: undefined }));
                  }}
                  placeholder="0000 000 000000"
                  aria-invalid={Boolean(errors.reference)}
                  aria-describedby={`${ids.ref}-hint`}
                  className={`auth-input tabular mt-2 px-4 tracking-[0.04em] ${errors.reference ? "is-error" : ""}`}
                />
                <p id={`${ids.ref}-hint`} className={errors.reference ? errorText : "mt-1.5 flex justify-between text-[0.8125rem] text-ink-2"}>
                  {errors.reference ?? (
                    <>
                      <span>On your GCash receipt, under “Ref No.”</span>
                      <span className="tabular">{digits.length}/13</span>
                    </>
                  )}
                </p>
              </div>

              <div className="mt-6">
                <p id={ids.proof} className={label}>
                  Screenshot of the receipt
                </p>
                {proof ? (
                  <div className="mt-2 flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={proof.url} alt="Your GCash receipt" className="h-24 w-auto max-w-[8rem] rounded-xl bg-[var(--photo-bg)] object-contain p-1 shadow-[inset_0_0_0_1px_var(--line)]" />
                    <button
                      type="button"
                      onClick={() => {
                        createClient().storage.from("payment-proofs").remove([proof.path]);
                        setProof(null);
                      }}
                      className="press inline-flex h-10 items-center rounded-full px-4 text-[0.875rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <label
                    className={`press mt-2 flex h-14 cursor-pointer items-center justify-center gap-2 rounded-xl text-[0.9375rem] font-semibold focus-within:shadow-[0_0_0_2px_var(--amber)] ${
                      errors.proof ? "text-ink shadow-[inset_0_0_0_2px_var(--ink)]" : "text-ink-2 shadow-[inset_0_0_0_1.5px_var(--line)] hover:text-ink"
                    }`}
                  >
                    {uploading ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : <ImagePlus aria-hidden="true" className="size-5" />}
                    {uploading ? "Uploading…" : "Add screenshot"}
                    <input
                      ref={(el) => {
                        fields.current.proof = el;
                      }}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      aria-labelledby={ids.proof}
                      aria-describedby={errors.proof ? `${ids.proof}-err` : undefined}
                      aria-invalid={Boolean(errors.proof)}
                      disabled={uploading}
                      onChange={(e) => {
                        pickProof(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
                {errors.proof && (
                  <p id={`${ids.proof}-err`} className={errorText}>
                    {errors.proof}
                  </p>
                )}
              </div>

              {errors.form && (
                <p role="alert" className="auth-alert mt-5 rounded-xl px-4 py-3 text-[0.9375rem]">
                  {errors.form}
                </p>
              )}

              <button
                type="button"
                onClick={send}
                disabled={busy}
                className="press mt-7 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-board px-6 text-[1rem] font-semibold text-board-ink hover:bg-board-deep disabled:opacity-70"
              >
                {sending && <LoaderCircle aria-hidden="true" className="size-[1.125rem] animate-spin" />}
                {sending ? "Sending…" : value > 0 ? `Send payment · ${formatPeso(value)}` : "Send payment"}
              </button>
              <p className="mt-3 text-center text-[0.8125rem] text-ink-2">Paying cash instead? Pay at the counter; staff record it there.</p>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
