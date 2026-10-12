"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Camera, Check, ImageUp, LoaderCircle, PenLine, X } from "lucide-react";
import { formatPeso } from "@/features/shared/catalog/catalog";
import { prepareForUpload } from "@/features/shared/photos/prepare-upload";
import { cleanReference, digitsOnly, formatReference, referenceFits, referenceLength, type PaymentProvider } from "@/features/shared/payments/model";
import { parseAmount, roundPeso } from "@/features/admin/pos/amounts";
import { scanReceipt } from "@/features/admin/pos/actions";
import {
  blocks,
  formatReceiptDate,
  needsConfirm,
  reviewNotices,
  STATUS_LABEL,
  type EPayment,
  type ReceiptField,
  type ReceiptFields,
  type ReviewNotice,
  type ScanConcern,
  type ScanFailure,
  type ScanResult,
} from "@/features/admin/pos/scan";
import { DEMO_KINDS, demoScan, demoScans, type DemoKind } from "@/features/admin/pos/scan-demo";

/** One opening of the sheet: a new payment through a provider, or one already in the sale. */
export type ScanSession = { id: string; provider: string; editing: EPayment | null };

/** A receipt photo, kept in this tab only (never saved with the sale in progress). */
export type ReceiptPhoto = { url: string; blob: Blob };

type Step = "start" | "preview" | "reading" | "review" | "failed";

const MAX_FILE = 20 * 1024 * 1024;
const green =
  "press inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-board px-5 text-[1.0625rem] font-semibold text-board-ink hover:bg-board-deep disabled:opacity-50";
const outlined =
  "press inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-[1.0625rem] font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--line)] hover:bg-ground-2 disabled:opacity-50";
const quiet = "press inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-4 text-[0.9375rem] font-semibold text-ink hover:bg-ground-2";

const FAILURE: Record<ScanFailure, { title: string; next: string; retake: boolean }> = {
  unreadable: { title: "We couldn’t read this receipt.", next: "Retake it closer and straight on, with less glare, or type the details.", retake: true },
  not_receipt: { title: "This doesn’t look like a payment receipt.", next: "Photograph the confirmation screen the customer’s app shows after paying.", retake: true },
  file: { title: "That file isn’t a photo we can use.", next: "Take a photo, or upload a JPG, PNG, or WebP screenshot.", retake: true },
  quota: { title: "Receipt reading has reached its limit for now.", next: "Type the details from the receipt instead. Nothing in the sale has changed.", retake: false },
  unavailable: { title: "Receipt reading isn’t available right now.", next: "Type the details from the receipt instead. Nothing in the sale has changed.", retake: false },
};

/**
 * The e-payment sheet: photograph or upload the customer's receipt, let it be read, check the
 * details, and add the payment to the sale. Nothing here charges anything; Charge stays on the sale.
 * A bottom sheet on phones, a dialog on tablets and up (the auth dialog).
 */
export function PosScanSheet({
  session,
  reader,
  providers,
  due,
  others,
  photo: savedPhoto,
  onProvider,
  onAdd,
  onRemove,
  onClose,
}: {
  session: ScanSession | null;
  /** Whether the receipt reader (Gemini) is connected on the server. */
  reader: boolean;
  providers: PaymentProvider[];
  /** Still owed without this payment. */
  due: number;
  /** The sale's other e-payments. */
  others: EPayment[];
  /** The photo of the payment being reopened, when this tab still has it. */
  photo: ReceiptPhoto | null;
  onProvider: (code: string) => void;
  onAdd: (payment: EPayment, photo: ReceiptPhoto | null) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const readToken = useRef(0);
  const ids = { title: useId(), ref: useId(), amount: useId(), demo: useId() };

  // The sheet keeps showing its last session while it closes, so the content doesn't vanish mid-slide.
  const [shown, setShown] = useState<ScanSession | null>(session);
  const [step, setStep] = useState<Step>("start");
  const [photo, setPhoto] = useState<ReceiptPhoto | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [read, setRead] = useState<ReceiptFields | null>(null);
  const [unsure, setUnsure] = useState<ReceiptField[]>([]);
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);
  const [concerns, setConcerns] = useState<ScanConcern[]>([]);
  const [scanId, setScanId] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [failure, setFailure] = useState<{ kind: ScanFailure; detail?: string } | null>(null);
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [confirmed, setConfirmed] = useState<ReviewNotice["kind"][]>([]);
  // In development the photo is read for real when the reader is connected; samples stay a pick away.
  const [demoKind, setDemoKind] = useState<DemoKind>(reader ? "real" : "good");
  const [touch, setTouch] = useState(true);

  // A new session starts fresh: a new payment at the first step, a reopened one at its review.
  if (session && session.id !== shown?.id) {
    setShown(session);
    const e = session.editing;
    setStep(e ? "review" : "start");
    setPhoto(e ? savedPhoto : null);
    setZoom(false);
    setRead(e?.read ?? null);
    setUnsure([]);
    setDuplicateOf(null);
    setConcerns([]);
    setScanId(e?.scanId ?? null);
    setDemo(false);
    setFailure(null);
    setReference(e?.reference ?? "");
    setAmount(e ? String(e.amount) : "");
    setConfirmed([]);
  } else if (session && shown && session.provider !== shown.provider) {
    setShown(session);
  }

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (session && !d.open) d.showModal();
    if (!session && d.open) d.close();
  }, [session]);

  useEffect(() => {
    // Phones and tablets open their own camera; elsewhere a picker is the only way in.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the device once, after hydration
    setTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  // Each step announces itself by moving focus to its heading (no amber ring: it's not a control).
  useEffect(() => {
    if (session) headingRef.current?.focus({ preventScroll: true });
  }, [step, session]);

  const provider = providers.find((p) => p.code === shown?.provider) ?? providers[0];
  if (!provider) return null;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setFailure(null);
    if (file.size > MAX_FILE) {
      setFailure({ kind: "file", detail: "That file is over 20 MB." });
      setStep("failed");
      return;
    }
    setPreparing(true);
    try {
      // Large photos shrink to 1800px and HEIC and the like become WebP, the same as every upload.
      const { blob } = await prepareForUpload(file);
      setPhoto({ url: URL.createObjectURL(blob), blob });
      setStep("preview");
    } catch (e) {
      setFailure({ kind: "file", detail: e instanceof Error ? e.message : undefined });
      setStep("failed");
    } finally {
      setPreparing(false);
    }
  };

  const apply = (result: ScanResult) => {
    setDemo(result.demo);
    if (!result.ok) {
      setFailure({ kind: result.kind });
      setStep("failed");
      return;
    }
    setRead(result.fields);
    setUnsure(result.unsure);
    setDuplicateOf(result.duplicateOf);
    setConcerns(result.concerns);
    setScanId(result.scanId);
    setReference(result.fields.reference ?? "");
    // An amount the receipt doesn't show is left for the cashier to type, never guessed from the total.
    setAmount(result.fields.amount !== null ? String(result.fields.amount) : "");
    setConfirmed([]);
    setStep("review");
  };

  const readReceipt = async () => {
    const token = ++readToken.current;
    setStep("reading");
    let result: ScanResult;
    if (demoScans && demoKind !== "real") {
      await new Promise((r) => setTimeout(r, 1200));
      result = demoScan(demoKind, provider, providers, due);
    } else if (!reader || !photo) {
      result = { ok: false, kind: "unavailable", message: "", demo: false };
    } else {
      const form = new FormData();
      form.set("photo", photo.blob, "receipt");
      form.set("provider", provider.code);
      try {
        result = await scanReceipt(form);
      } catch {
        // The connection dropped: nothing in the sale changed, and the details can be typed.
        result = { ok: false, kind: "unavailable", message: "", demo: false };
      }
    }
    if (token !== readToken.current) return; // cancelled
    apply(result);
  };

  const cancelReading = () => {
    readToken.current++;
    setStep("preview");
  };

  const retake = () => {
    setFailure(null);
    setStep("start");
    if (touch) cameraRef.current?.click();
  };

  const typeInstead = () => {
    readToken.current++;
    setRead(null);
    setUnsure([]);
    setDuplicateOf(null);
    setConcerns([]);
    setScanId(null);
    setDemo(false);
    setFailure(null);
    setReference("");
    setAmount(due > 0 ? String(due) : "");
    setConfirmed([]);
    setStep("review");
  };

  const busy = preparing || step === "reading";
  const editing = shown?.editing ?? null;
  const value = parseAmount(amount);
  const notices = reviewNotices({
    provider,
    providers,
    reference,
    amount: value,
    due,
    read,
    duplicateOf,
    concerns,
    others: others.filter((o) => o.id !== editing?.id),
  });
  const waiting = notices.filter((n) => needsConfirm(n) && !confirmed.includes(n.kind));
  const stopped = notices.find(blocks);
  const fits = referenceFits(provider, reference);
  const length = referenceLength(provider);
  const numeric = digitsOnly(provider);
  const typed = cleanReference(reference).length;
  const amountOk = value > 0 && value < 10_000_000;
  const canAdd = fits && amountOk && !stopped && waiting.length === 0;
  const why = !typed
    ? `Enter the ${provider.name} reference number.`
    : !fits
      ? length
        ? `The ${provider.name} reference has ${length} digits (${typed}/${length}).`
        : `That ${provider.name} reference doesn’t look complete.`
      : !amountOk
        ? "Enter the amount on the receipt."
        : stopped?.kind === "duplicate"
          ? "This reference can’t be used again."
          : stopped?.kind === "failed"
            ? "A failed payment can’t be taken."
            : waiting.length
              ? "Tick the notes above to continue."
              : "";

  const add = () => {
    if (!canAdd || !shown) return;
    onAdd(
      {
        id: editing?.id ?? crypto.randomUUID(),
        provider: provider.code,
        reference: cleanReference(reference),
        amount: roundPeso(value),
        source: read ? "scan" : (editing?.source ?? "manual"),
        read: read ?? editing?.read ?? null,
        scanId: read ? scanId : (editing?.scanId ?? null),
      },
      photo,
    );
  };

  const fieldState = (field: ReceiptField, current: string | number | null): Mark => {
    if (!read) return null;
    const got = read[field];
    if (got === null || got === undefined) return "missing";
    if (current !== null) {
      const same = field === "reference" ? cleanReference(String(got)) === cleanReference(String(current)) : field === "amount" ? roundPeso(Number(got)) === roundPeso(Number(current)) : true;
      if (!same) return "edited";
    }
    return unsure.includes(field) ? "unsure" : "read";
  };

  const heading =
    step === "start"
      ? "Photograph the receipt"
      : step === "preview"
        ? "Is it all in the photo?"
        : step === "reading"
          ? "Reading the receipt…"
          : step === "failed"
            ? FAILURE[failure?.kind ?? "unreadable"].title
            : read
              ? "Check the details"
              : "Type the details";

  return (
    <dialog
      ref={dialog}
      className="auth-dialog dialog-wide"
      aria-labelledby={ids.title}
      onCancel={(e) => {
        if (zoom) {
          e.preventDefault();
          setZoom(false);
        }
      }}
      onClose={() => {
        readToken.current++;
        onClose();
      }}
      // A tap outside closes the sheet only before there's a photo, so a stray tap never loses a reading.
      onClick={(e) => e.target === e.currentTarget && step === "start" && dialog.current?.close()}
    >
      <div className="auth-sheet px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:px-7 sm:pb-7 sm:pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p id={ids.title} className="voice-display text-[1.75rem] leading-none">
              {provider.name} payment
            </p>
            <p className="tabular mt-1.5 text-[0.875rem] text-ink-2">
              {due > 0 ? `${formatPeso(due)} still due` : "The total is already covered"}
              {editing && " · editing"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {demo && <DemoPill />}
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="press -mr-2 grid size-10 place-items-center rounded-full text-ink-2 hover:bg-ground-2 hover:text-ink"
            >
              <X aria-hidden="true" className="size-5" />
              <span className="sr-only">Close</span>
            </button>
          </div>
        </div>

        <h3 ref={headingRef} tabIndex={-1} aria-live="polite" className="mt-5 text-[1.125rem] font-semibold leading-snug text-ink outline-none">
          {heading}
        </h3>

        {/* The two ways in: the phone's own camera, or an image already on it. */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        {zoom && photo ? (
          <div className="mt-4">
            <div className="scan-photo">
              {/* eslint-disable-next-line @next/next/no-img-element -- a photo from this tab (blob URL) */}
              <img src={photo.url} alt="The customer’s receipt, full size" className="max-h-[70dvh]" />
            </div>
            <button type="button" onClick={() => setZoom(false)} className={`${quiet} mt-3 -ml-2`}>
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back to the details
            </button>
          </div>
        ) : step === "start" ? (
          <div className="mt-3">
            <p className="max-w-[46ch] text-[0.9375rem] leading-relaxed text-ink-2">
              Fill the frame with the receipt and hold it straight. Tilt the customer’s phone a little so lights don’t glare on the screen.
            </p>
            <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
              {touch && (
                <button type="button" onClick={() => cameraRef.current?.click()} disabled={preparing} className={green}>
                  {preparing ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : <Camera aria-hidden="true" className="size-5" />}
                  Take photo
                </button>
              )}
              <button type="button" onClick={() => fileRef.current?.click()} disabled={preparing} className={touch ? outlined : green}>
                <ImageUp aria-hidden="true" className="size-5" />
                {touch ? "Upload screenshot" : "Choose receipt image"}
              </button>
            </div>
            <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-2">
              If the camera doesn’t open, allow camera access for this site in the browser’s settings, or upload a screenshot.
            </p>
            <div className="mt-4 border-t border-line pt-3">
              <button type="button" onClick={typeInstead} className={`${quiet} -ml-2`}>
                <PenLine aria-hidden="true" className="size-4" />
                Type the details instead
              </button>
            </div>
          </div>
        ) : step === "preview" || step === "reading" ? (
          <div className="mt-4">
            <div className="scan-photo" data-busy={step === "reading" || undefined} aria-busy={step === "reading"}>
              {photo && (
                // eslint-disable-next-line @next/next/no-img-element -- a photo from this tab (blob URL)
                <img src={photo.url} alt="The customer’s receipt" className="max-h-[46dvh]" />
              )}
              {step === "reading" && (
                <span className="scan-reading">
                  <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
                  Reading
                </span>
              )}
            </div>
            {step === "preview" ? (
              <>
                {demoScans && (
                  <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-ground-2 px-3.5 py-2.5 shadow-[inset_0_0_0_1px_var(--line)]">
                    <DemoPill />
                    <label htmlFor={ids.demo} className="text-[0.8125rem] font-semibold text-ink">
                      Result
                    </label>
                    <select
                      id={ids.demo}
                      value={demoKind}
                      onChange={(e) => setDemoKind(e.target.value as DemoKind)}
                      className="h-9 min-w-0 flex-1 rounded-full bg-ground px-3 text-[0.875rem] text-ink shadow-[inset_0_0_0_1px_var(--line)]"
                    >
                      {Object.entries(DEMO_KINDS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <p className="w-full text-[0.75rem] text-ink-2">
                      Development only. Pick a sample to see a state without a receipt that shows it{reader ? "" : "; the reader isn’t connected"}.
                    </p>
                  </div>
                )}
                <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  <button type="button" onClick={readReceipt} className={green}>
                    Read receipt
                  </button>
                  <button type="button" onClick={retake} className={outlined}>
                    <Camera aria-hidden="true" className="size-5" />
                    Retake
                  </button>
                </div>
                <div className="mt-2 flex justify-center">
                  <button type="button" onClick={typeInstead} className={quiet}>
                    Type the details instead
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 text-[0.875rem] text-ink-2">Usually a few seconds. The sale stays as it is.</p>
                <button type="button" onClick={cancelReading} className={`${outlined} mt-4`}>
                  Cancel
                </button>
              </>
            )}
          </div>
        ) : step === "failed" ? (
          <div className="mt-3">
            <p className="max-w-[46ch] text-[0.9375rem] leading-relaxed text-ink-2">
              {failure?.detail ? `${failure.detail} ` : ""}
              {FAILURE[failure?.kind ?? "unreadable"].next}
            </p>
            {photo && failure?.kind !== "file" && (
              <div className="scan-photo mt-4">
                {/* eslint-disable-next-line @next/next/no-img-element -- a photo from this tab (blob URL) */}
                <img src={photo.url} alt="The receipt photo that couldn’t be read" className="max-h-[28dvh] opacity-80" />
              </div>
            )}
            <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
              {FAILURE[failure?.kind ?? "unreadable"].retake ? (
                <>
                  <button type="button" onClick={retake} className={green}>
                    <Camera aria-hidden="true" className="size-5" />
                    Retake
                  </button>
                  <button type="button" onClick={typeInstead} className={outlined}>
                    <PenLine aria-hidden="true" className="size-5" />
                    Type the details
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={typeInstead} className={green}>
                    <PenLine aria-hidden="true" className="size-5" />
                    Type the details
                  </button>
                  <button type="button" onClick={retake} className={outlined}>
                    <Camera aria-hidden="true" className="size-5" />
                    Try another photo
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          /* Review: the details as read (or typed), what they mean for the sale, and Add. */
          <form
            className="mt-3"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            {demo && read && <p className="mb-3 text-[0.8125rem] font-semibold text-ink">Sample result, not read from the photo.</p>}

            <div className="flex gap-4">
              {photo && (
                <button type="button" onClick={() => setZoom(true)} className="press scan-thumb shrink-0" aria-label="See the receipt photo full size">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a photo from this tab (blob URL) */}
                  <img src={photo.url} alt="" />
                </button>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor={ids.ref} className="text-[0.875rem] font-semibold text-ink">
                    Reference number
                  </label>
                  <FieldMark mark={fieldState("reference", reference)} />
                </div>
                <input
                  id={ids.ref}
                  inputMode={numeric ? "numeric" : "text"}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  value={numeric ? formatReference(provider.code, reference) : reference}
                  onChange={(e) =>
                    setReference(
                      numeric ? e.target.value.replace(/\D/g, "").slice(0, length ?? 40) : e.target.value.toUpperCase().replace(/[^A-Z0-9 -]/g, "").slice(0, 60),
                    )
                  }
                  placeholder={numeric && length === 13 ? "1234 567 890123" : undefined}
                  aria-describedby={`${ids.ref}-hint`}
                  className="auth-input tabular mt-1.5 px-4 text-[1.25rem] tracking-[0.02em]"
                />
                <p id={`${ids.ref}-hint`} className="mt-1.5 text-[0.8125rem] text-ink-2">
                  {fits ? "Check it against the receipt, digit for digit." : `${provider.hint}${length ? ` (${typed}/${length})` : ""}`}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor={ids.amount} className="text-[0.875rem] font-semibold text-ink">
                  Amount paid
                </label>
                <FieldMark mark={fieldState("amount", amount === "" ? null : value)} />
              </div>
              <div className="relative mt-1.5">
                <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[1rem] text-ink-2">
                  ₱
                </span>
                <input
                  id={ids.amount}
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
                  placeholder="0"
                  className="auth-input tabular pl-9 pr-4 text-[1.25rem]"
                />
              </div>
            </div>

            {read && (
              <dl className="mt-4 grid grid-cols-[auto_1fr_auto] items-baseline gap-x-4 gap-y-2 border-y border-line py-3 text-[0.9375rem]">
                <dt className="text-ink-2">Date and time</dt>
                <dd className="tabular text-ink">{formatReceiptDate(read.date, read.time) ?? "—"}</dd>
                <dd>
                  <FieldMark mark={fieldState("date", null)} />
                </dd>
                <dt className="text-ink-2">Status</dt>
                <dd className="text-ink">{read.status ? STATUS_LABEL[read.status] : "—"}</dd>
                <dd>
                  <FieldMark mark={fieldState("status", null)} />
                </dd>
                <dt className="text-ink-2">Sent to</dt>
                <dd className="min-w-0 break-words text-ink">{read.recipient ?? "—"}</dd>
                <dd>
                  <FieldMark mark={fieldState("recipient", null)} />
                </dd>
              </dl>
            )}

            <Notices
              notices={notices}
              provider={provider}
              confirmed={confirmed}
              onConfirm={(kind, on) => setConfirmed((c) => (on ? [...c, kind] : c.filter((k) => k !== kind)))}
              onSwitch={(code) => {
                setConfirmed([]);
                onProvider(code);
              }}
            />

            <button type="submit" disabled={!canAdd} className={`${green} mt-5`}>
              <span>
                {editing ? "Save payment" : `Add ${provider.name} payment`}
                {amountOk && <span className="tabular"> · {formatPeso(value)}</span>}
              </span>
            </button>
            {!canAdd && why && <p className="mt-2 text-center text-[0.8125rem] text-ink-2">{why}</p>}

            <div className="mt-2 flex flex-wrap justify-center gap-1">
              {photo || read ? (
                <button type="button" onClick={retake} className={quiet}>
                  <Camera aria-hidden="true" className="size-4" />
                  Retake
                </button>
              ) : (
                <button type="button" onClick={() => setStep("start")} className={quiet}>
                  <Camera aria-hidden="true" className="size-4" />
                  Scan the receipt instead
                </button>
              )}
              {editing && (
                <button type="button" onClick={() => onRemove(editing.id)} className={`${quiet} text-ink-2`}>
                  Remove this payment
                </button>
              )}
            </div>
          </form>
        )}
        {busy && <span className="sr-only" role="status">{preparing ? "Preparing the photo" : "Reading the receipt"}</span>}
      </div>
    </dialog>
  );
}

type Mark = "read" | "unsure" | "missing" | "edited" | null;

/** How sure a field is: read from the receipt, to double-check, not on it, or changed by hand. */
function FieldMark({ mark }: { mark: Mark }) {
  if (!mark) return null;
  if (mark === "read")
    return (
      <span className="inline-flex items-center gap-1 text-[0.8125rem] text-ink-2">
        <Check aria-hidden="true" className="size-3.5 text-board-text" strokeWidth={2.5} />
        From the receipt
      </span>
    );
  if (mark === "unsure")
    return (
      <span className="inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-ink">
        <span aria-hidden="true" className="size-2 rounded-full bg-amber" />
        Check this
      </span>
    );
  if (mark === "missing")
    return (
      <span className="inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-2">
        <span aria-hidden="true" className="size-2 rounded-full shadow-[inset_0_0_0_1.5px_var(--ink-2)]" />
        Not on the receipt
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[0.8125rem] text-ink-2">
      <PenLine aria-hidden="true" className="size-3.5" />
      Changed by hand
    </span>
  );
}

function DemoPill() {
  return <span className="voice-label rounded-full px-2 py-0.5 text-[0.6875rem] uppercase text-ink shadow-[inset_0_0_0_1.5px_var(--ink)]">Demo</span>;
}

/** What the payment means for the sale, and anything the cashier has to settle first, in one panel. */
function Notices({
  notices,
  provider,
  confirmed,
  onConfirm,
  onSwitch,
}: {
  notices: ReviewNotice[];
  provider: PaymentProvider;
  confirmed: ReviewNotice["kind"][];
  onConfirm: (kind: ReviewNotice["kind"], on: boolean) => void;
  onSwitch: (code: string) => void;
}) {
  if (notices.length === 0) return null;
  const urgent = notices.some((n) => blocks(n) || (needsConfirm(n) && !confirmed.includes(n.kind)));
  return (
    <ul className={`scan-notices mt-4 ${urgent ? "scan-notices-urgent" : ""}`}>
      {notices.map((n) => (
        <li key={n.kind} className="text-[0.9375rem] leading-snug text-ink">
          {n.kind === "short" && (
            <>
              This covers <b className="tabular">{formatPeso(n.covers)}</b> of the {formatPeso(n.due)} due. Take the rest another way.
            </>
          )}
          {n.kind === "over" && (
            <>
              <b className="tabular">{formatPeso(n.change)}</b> over the {formatPeso(n.due)} due. Give it back as cash change.
            </>
          )}
          {n.kind === "edited_amount" && (
            <>
              The receipt shows <b className="tabular">{formatPeso(n.receipt)}</b>. Use what the customer actually sent.
            </>
          )}
          {n.kind === "duplicate" && (
            <>
              <b>This reference is already {n.sale ? `on sale ${n.sale}` : "in this sale"}.</b> The same payment can’t be counted twice; check the number on the customer’s
              screen.
            </>
          )}
          {n.kind === "failed" && (
            <>
              <b>The receipt says the payment failed.</b> Ask the customer to send it again, then scan the new receipt.
            </>
          )}
          {n.kind === "suspicious" && (
            <Confirm checked={confirmed.includes("suspicious")} onChange={(on) => onConfirm("suspicious", on)} label="It matches the payment in the customer’s app">
              <b>This receipt may have been edited.</b> Ask to see the payment in the customer’s app history before taking it.
            </Confirm>
          )}
          {n.kind === "photo_quality" && <>The photo is blurry, glared, or cut off. Check the marked fields against the customer’s screen.</>}
          {n.kind === "several_receipts" && <>There’s more than one receipt in the photo. Make sure these details are from the right one.</>}
          {n.kind === "pending" && (
            <Confirm checked={confirmed.includes("pending")} onChange={(on) => onConfirm("pending", on)} label="The customer’s app now shows it completed">
              <b>The receipt says Pending.</b> Take it only once the payment shows as completed.
            </Confirm>
          )}
          {n.kind === "old_date" && (
            <Confirm checked={confirmed.includes("old_date")} onChange={(on) => onConfirm("old_date", on)} label="The customer paid this for today’s sale">
              <b>
                Dated <span className="tabular">{formatReceiptDate(n.date, null)}</span>, not today.
              </b>{" "}
              An old receipt may already have paid for something else.
            </Confirm>
          )}
          {n.kind === "provider" && (
            <>
              <b>This looks like a {n.read.name} receipt.</b>
              <span className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSwitch(n.read.code)}
                  className="press inline-flex h-9 items-center rounded-full bg-ink px-3.5 text-[0.875rem] font-semibold text-ground hover:opacity-90"
                >
                  Switch to {n.read.name}
                </button>
                <Confirm checked={confirmed.includes("provider")} onChange={(on) => onConfirm("provider", on)} label={`It’s a ${provider.name} payment`} inline />
              </span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function Confirm({
  checked,
  onChange,
  label,
  inline,
  children,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label: string;
  inline?: boolean;
  children?: React.ReactNode;
}) {
  const id = useId();
  return (
    <>
      {children}
      <span className={`${inline ? "" : "mt-2 "}flex items-center gap-2.5`}>
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="scan-check" />
        <label htmlFor={id} className="text-[0.875rem] font-semibold text-ink">
          {label}
        </label>
      </span>
    </>
  );
}
