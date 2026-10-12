"use client";

import { uuid } from "@/lib/uuid";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronDown, ImagePlus, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { prepareForUpload } from "@/features/shared/photos/prepare-upload";
import { garmentColor } from "@/features/shared/catalog/colors";
import {
  blankGarment,
  checkDetails,
  checkGarments,
  COLOR_SUGGESTIONS,
  FITS,
  fitOf,
  garmentName,
  GARMENTS,
  manilaToday,
  MAX_GARMENTS,
  MAX_REFERENCES,
  OTHER,
  piecesOf,
  sizeRunText,
  toLines,
  totalPieces,
  type DraftErrors,
  type Fit,
  type GarmentDraft,
  type ReferenceImage,
  type RequestDraft,
} from "@/features/customer/orders/model";
import { createClient } from "@/lib/supabase/client";
import { submitRequest, updateRequest, type RequestPayload } from "@/features/customer/orders/actions";

const STEPS = ["Details", "Garments", "Review"] as const;
type Step = 0 | 1 | 2;

const label = "text-[0.9375rem] font-semibold text-ink";
const hint = "mt-1.5 text-[0.8125rem] leading-relaxed text-ink-2";
const errorText = "mt-2 text-[0.875rem] font-semibold text-ink";

function niceDate(iso: string) {
  return new Intl.DateTimeFormat("en-PH", { weekday: "short", month: "long", day: "numeric", year: "numeric" }).format(
    new Date(`${iso}T00:00:00+08:00`),
  );
}

/**
 * The custom-order request: Details, then Garments (a size run per garment), then Review.
 * Each step checks itself before moving on; the database checks everything again on send.
 * Reference images upload as soon as they're picked, into the customer's own folder.
 */
export function RequestForm({
  uid,
  initial,
  orderId,
  migrated,
}: {
  uid: string;
  initial: RequestDraft;
  /** Set when editing a request that hasn't been accepted yet. */
  orderId?: string;
  migrated: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<RequestDraft>(initial);
  const [step, setStep] = useState<Step>(0);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const ids = { description: useId(), team: useId(), neededBy: useId(), notes: useId(), refs: useId() };

  // Each new step starts at the top with its heading focused, so screen readers hear where they are.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    headingRef.current?.focus();
  }, [step]);

  // Fixing a field clears its message right away.
  const clearError = (...keys: (keyof DraftErrors)[]) =>
    setErrors((e) => {
      if (!keys.some((k) => e[k])) return e;
      const next = { ...e };
      for (const k of keys) delete next[k];
      return next;
    });
  const patch = (p: Partial<RequestDraft>) => {
    setDraft((d) => ({ ...d, ...p }));
    if ("description" in p) clearError("description");
    if ("team" in p) clearError("team");
    if ("neededBy" in p) clearError("neededBy");
    if ("garments" in p) clearError("garments");
  };
  const patchGarment = (key: string, p: Partial<GarmentDraft>) => {
    setDraft((d) => ({ ...d, garments: d.garments.map((g) => (g.key === key ? { ...g, ...p } : g)) }));
    clearError(`garment:${key}`, "garments");
  };

  const goTo = (next: Step) => {
    // Moving forward checks the step being left; moving back never blocks.
    if (next > step) {
      const blocking = step === 0 ? checkDetails(draft) : checkGarments(draft);
      if (Object.keys(blocking).length) {
        setErrors(blocking);
        // After the error marks render, take the customer to the first one.
        requestAnimationFrame(() => {
          const first = document.querySelector<HTMLElement>("[data-invalid='true']");
          first?.focus();
          first?.scrollIntoView({ block: "center" });
        });
        return;
      }
    }
    setErrors({});
    setStep(next);
  };

  // --- Reference images -----------------------------------------------------
  const addReferences = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploadError(null);
    const room = MAX_REFERENCES - draft.references.length;
    const picked = Array.from(files).slice(0, room);
    if (files.length > room) setUploadError(`You can attach up to ${MAX_REFERENCES} pictures.`);
    const supabase = createClient();
    for (const file of picked) {
      setUploading((n) => n + 1);
      try {
        const { blob, ext, type } = await prepareForUpload(file);
        const path = `${uid}/${uuid()}.${ext}`;
        const { error } = await supabase.storage.from("order-references").upload(path, blob, { contentType: type });
        if (error) throw new Error(migrated ? "That picture didn’t upload. Check your connection and try again." : "Picture uploads need the latest database update.");
        const url = URL.createObjectURL(blob);
        setDraft((d) => ({ ...d, references: [...d.references, { path, url }].slice(0, MAX_REFERENCES) }));
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "That picture didn’t upload. Try another one.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const removeReference = (ref: ReferenceImage) => {
    patch({ references: draft.references.filter((r) => r.path !== ref.path) });
    // A picture that was only uploaded during this visit can go right away; saved ones go after saving.
    if (!initial.references.some((r) => r.path === ref.path)) {
      createClient().storage.from("order-references").remove([ref.path]);
    }
  };

  // --- Send -------------------------------------------------------------------
  const send = async () => {
    const found = { ...checkDetails(draft), ...checkGarments(draft) };
    if (Object.keys(found).length) {
      setErrors(found);
      setStep(found.description || found.team || found.neededBy ? 0 : 1);
      return;
    }
    setSending(true);
    setSendError(null);
    const payload: RequestPayload = {
      team: draft.team,
      description: draft.description,
      neededBy: draft.neededBy,
      notes: draft.notes,
      references: draft.references.map((r) => r.path),
      aiDesignId: draft.design?.id ?? null,
      lines: toLines(draft.garments),
    };
    const result = orderId ? await updateRequest(orderId, payload) : await submitRequest(payload);
    if (!result.ok) {
      setSending(false);
      setSendError(result.message);
      return;
    }
    if (orderId) {
      const dropped = initial.references.filter((r) => !draft.references.some((d) => d.path === r.path)).map((r) => r.path);
      if (dropped.length) await createClient().storage.from("order-references").remove(dropped);
    }
    router.push(`/orders/${result.id}?${orderId ? "saved" : "sent"}=1`);
    router.refresh();
  };

  const pieces = totalPieces(draft);

  return (
    <div className="mx-auto max-w-[46rem]">
      <StepStrip step={step} onPick={(s) => s < step && goTo(s)} />

      {!migrated && (
        <p role="status" className="auth-alert mt-6 rounded-2xl px-5 py-4 text-[0.9375rem]">
          Sending custom orders needs the shop’s latest database update. You can fill this in, but it won’t send until then.
        </p>
      )}

      {step === 0 && (
        <section aria-labelledby="step-title" className="mt-8">
          <h2 id="step-title" ref={headingRef} tabIndex={-1} className="voice-display text-[clamp(1.875rem,4vw,2.5rem)] outline-none">
            What are we making?
          </h2>
          <p className="mt-2 text-[1rem] leading-relaxed text-ink-2">Tell the shop who it’s for and when you need it. You’ll add the garments next.</p>

          <div className="mt-8 flex flex-col gap-7">
            {draft.design && (
              <div>
                <p className={label}>Design from the studio</p>
                <div className="mt-2 flex items-center gap-4 rounded-2xl bg-ground-2 p-3 shadow-[inset_0_0_0_1px_var(--line)]">
                  <div className="shop-tile aspect-[3/2] w-32 shrink-0 rounded-xl">
                    {draft.design.url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={draft.design.url} alt="Your attached design" className="size-full object-contain" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[0.9375rem] font-semibold text-ink">{draft.design.label}</p>
                    <p className="text-[0.8125rem] text-ink-2">The shop sees this design with your request.</p>
                    <button
                      type="button"
                      onClick={() => patch({ design: null })}
                      className="press -ml-1 mt-1.5 inline-flex h-9 items-center rounded-full px-3 text-[0.875rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label htmlFor={ids.description} className={label}>
                What’s the order for?
              </label>
              <textarea
                id={ids.description}
                value={draft.description}
                onChange={(e) => patch({ description: e.target.value })}
                rows={3}
                maxLength={500}
                placeholder="e.g. Liga uniforms for the barangay tournament, 15 players"
                aria-invalid={Boolean(errors.description)}
                aria-describedby={errors.description ? `${ids.description}-err` : undefined}
                data-invalid={errors.description ? "true" : undefined}
                className={`auth-input auth-input-grow mt-2 min-h-24 resize-y px-4 py-3 leading-relaxed ${errors.description ? "is-error" : ""}`}
              />
              {errors.description && (
                <p id={`${ids.description}-err`} className={errorText}>
                  {errors.description}
                </p>
              )}
            </div>

            <div className="grid gap-7 sm:grid-cols-2 sm:gap-5">
              <div>
                <label htmlFor={ids.team} className={label}>
                  Team or organization <span className="font-normal text-ink-2">(optional)</span>
                </label>
                <input
                  id={ids.team}
                  value={draft.team}
                  onChange={(e) => patch({ team: e.target.value })}
                  maxLength={80}
                  placeholder="e.g. Mayon Blazers"
                  autoComplete="organization"
                  data-invalid={errors.team ? "true" : undefined}
                  className={`auth-input mt-2 px-4 ${errors.team ? "is-error" : ""}`}
                />
                {errors.team && <p className={errorText}>{errors.team}</p>}
              </div>
              <div>
                <label htmlFor={ids.neededBy} className={label}>
                  Needed by <span className="font-normal text-ink-2">(optional)</span>
                </label>
                <input
                  id={ids.neededBy}
                  type="date"
                  value={draft.neededBy}
                  min={manilaToday()}
                  onChange={(e) => patch({ neededBy: e.target.value })}
                  aria-describedby={`${ids.neededBy}-hint`}
                  data-invalid={errors.neededBy ? "true" : undefined}
                  className={`auth-input tabular mt-2 px-4 ${errors.neededBy ? "is-error" : ""}`}
                />
                <p id={`${ids.neededBy}-hint`} className={errors.neededBy ? errorText : hint}>
                  {errors.neededBy ?? "Your tournament or event day. The shop confirms if it can make it."}
                </p>
              </div>
            </div>

            <div>
              <p id={ids.refs} className={label}>
                Logo or reference pictures <span className="font-normal text-ink-2">(optional, up to {MAX_REFERENCES})</span>
              </p>
              <p className={hint}>Your team logo, a jersey you like, or a sketch. JPG, PNG, or WebP.</p>
              <ul aria-labelledby={ids.refs} className="mt-3 grid grid-cols-3 gap-3">
                {draft.references.map((r, i) => (
                  <li key={r.path} className="relative">
                    <div className="shop-tile aspect-square">
                      {r.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.url} alt={`Reference picture ${i + 1}`} className="size-full object-contain p-2" />
                      ) : (
                        <span className="grid size-full place-items-center text-[0.8125rem] text-ink-2">Picture {i + 1}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeReference(r)}
                      className="press absolute -right-2 -top-2 grid size-8 place-items-center rounded-full bg-ink text-ground shadow-[0_2px_6px_oklch(0_0_0/0.25)]"
                    >
                      <X aria-hidden="true" className="size-4" />
                      <span className="sr-only">Remove picture {i + 1}</span>
                    </button>
                  </li>
                ))}
                {draft.references.length + uploading < MAX_REFERENCES && (
                  <li>
                    <label className="press grid aspect-square cursor-pointer place-items-center rounded-[1.125rem] text-center text-ink-2 shadow-[inset_0_0_0_1.5px_var(--line)] hover:text-ink hover:shadow-[inset_0_0_0_1.5px_var(--ink-2)] focus-within:shadow-[0_0_0_2px_var(--amber)]">
                      <span className="flex flex-col items-center gap-1.5 text-[0.875rem] font-semibold">
                        <ImagePlus aria-hidden="true" className="size-6" />
                        Add picture
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="sr-only"
                        onChange={(e) => {
                          addReferences(e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </li>
                )}
                {Array.from({ length: uploading }, (_, i) => (
                  <li key={`up${i}`} className="shop-tile grid aspect-square place-items-center">
                    <LoaderCircle aria-hidden="true" className="size-6 animate-spin text-card-ink/60" />
                    <span className="sr-only">Uploading</span>
                  </li>
                ))}
              </ul>
              {uploadError && (
                <p role="alert" className={errorText}>
                  {uploadError}
                </p>
              )}
            </div>
          </div>

          <StepActions onNext={() => goTo(1)} nextLabel="Next: garments" busy={uploading > 0} busyNote="Waiting for pictures to finish uploading…" />
        </section>
      )}

      {step === 1 && (
        <section aria-labelledby="step-title" className="mt-8">
          <h2 id="step-title" ref={headingRef} tabIndex={-1} className="voice-display text-[clamp(1.875rem,4vw,2.5rem)] outline-none">
            Garments and sizes
          </h2>
          <p className="mt-2 text-[1rem] leading-relaxed text-ink-2">
            Add each garment with its color, then how many you need in every size.
          </p>

          <ol className="mt-8 flex flex-col gap-5">
            {draft.garments.map((g, i) => (
              <GarmentCard
                key={g.key}
                index={i}
                garment={g}
                error={errors[`garment:${g.key}`]}
                canRemove={draft.garments.length > 1}
                onChange={(p) => patchGarment(g.key, p)}
                onRemove={() => patch({ garments: draft.garments.filter((x) => x.key !== g.key) })}
              />
            ))}
          </ol>
          {errors.garments && (
            <p role="alert" className={errorText}>
              {errors.garments}
            </p>
          )}

          {draft.garments.length < MAX_GARMENTS && (
            <button
              type="button"
              onClick={() => patch({ garments: [...draft.garments, blankGarment()] })}
              className="press mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--line)] hover:shadow-[inset_0_0_0_1.5px_var(--ink-2)]"
            >
              <Plus aria-hidden="true" className="size-[1.125rem]" />
              Add another garment
            </button>
          )}

          <p className="mt-6 text-[0.9375rem] text-ink-2" aria-live="polite">
            <span className="tabular font-semibold text-ink">{pieces}</span> {pieces === 1 ? "piece" : "pieces"} in {draft.garments.length}{" "}
            {draft.garments.length === 1 ? "garment" : "garments"}
          </p>

          <StepActions onBack={() => goTo(0)} onNext={() => goTo(2)} nextLabel="Next: review" />
        </section>
      )}

      {step === 2 && (
        <section aria-labelledby="step-title" className="mt-8">
          <h2 id="step-title" ref={headingRef} tabIndex={-1} className="voice-display text-[clamp(1.875rem,4vw,2.5rem)] outline-none">
            Review your request
          </h2>
          <p className="mt-2 text-[1rem] leading-relaxed text-ink-2">
            Check everything once more. {orderId ? "Your changes replace the request the shop sees." : "The shop sees it as soon as you send it."}
          </p>

          <ReviewBlock title="Details" onEdit={() => goTo(0)}>
            <dl className="divide-y divide-line">
              <ReviewRow term="For">{draft.description.trim()}</ReviewRow>
              <ReviewRow term="Team">{draft.team.trim() || <span className="text-ink-2">Not given</span>}</ReviewRow>
              <ReviewRow term="Needed by">{draft.neededBy ? niceDate(draft.neededBy) : <span className="text-ink-2">No deadline</span>}</ReviewRow>
              {draft.design && (
                <ReviewRow term="Design">
                  <span className="flex items-center gap-3">
                    <span className="shop-tile block aspect-[3/2] w-24 shrink-0 rounded-lg">
                      {draft.design.url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={draft.design.url} alt="Your attached design" className="size-full object-contain" />
                      )}
                    </span>
                    <span className="min-w-0">{draft.design.label}</span>
                  </span>
                </ReviewRow>
              )}
              <ReviewRow term="Pictures">
                {draft.references.length ? (
                  <span className="flex gap-2">
                    {draft.references.map((r, i) => (
                      <span key={r.path} className="shop-tile block size-14 rounded-lg">
                        {r.url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.url} alt={`Reference picture ${i + 1}`} className="size-full object-contain p-1" />
                        )}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="text-ink-2">None</span>
                )}
              </ReviewRow>
            </dl>
          </ReviewBlock>

          <ReviewBlock title={`Garments · ${pieces} ${pieces === 1 ? "piece" : "pieces"}`} onEdit={() => goTo(1)}>
            <ul className="divide-y divide-line">
              {draft.garments.map((g) => (
                <li key={g.key} className="flex items-start gap-3 py-3.5">
                  <span
                    aria-hidden="true"
                    className="mt-1 size-4 shrink-0 rounded-full shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_18%,transparent)]"
                    style={{ background: g.color.trim() ? garmentColor(g.color).body : "transparent" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.9375rem] font-semibold text-ink">
                      {garmentName(g)}
                      {g.color.trim() && <span className="font-normal text-ink-2"> · {g.color.trim()}</span>}
                    </p>
                    <p className="tabular mt-0.5 text-[0.875rem] text-ink-2">{sizeRunText(g)}</p>
                    {g.notes.trim() && <p className="mt-1 whitespace-pre-line text-[0.875rem] text-ink-2">{g.notes.trim()}</p>}
                  </div>
                  <span className="tabular shrink-0 text-[0.9375rem] font-semibold text-ink">{piecesOf(g)}</span>
                </li>
              ))}
            </ul>
          </ReviewBlock>

          <div className="mt-8">
            <label htmlFor={ids.notes} className={label}>
              Anything else the shop should know? <span className="font-normal text-ink-2">(optional)</span>
            </label>
            <textarea
              id={ids.notes}
              value={draft.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              rows={3}
              maxLength={1000}
              placeholder="e.g. Fabric preference, print placement, how you’d like to be contacted"
              className="auth-input auth-input-grow mt-2 min-h-24 resize-y px-4 py-3 leading-relaxed"
            />
          </div>

          <div className="mt-8 rounded-2xl bg-ground-2 px-5 py-4 text-[0.9375rem] leading-relaxed text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]">
            <p className="font-semibold text-ink">What happens next</p>
            <p className="mt-1">
              The shop reviews your request and sends you a price. Production starts once you’ve paid at least half as a down
              payment, and you pay the rest at pickup. You can still edit or cancel until the shop accepts it.
            </p>
          </div>

          {sendError && (
            <p role="alert" className="auth-alert mt-6 rounded-2xl px-5 py-4 text-[0.9375rem]">
              {sendError}
            </p>
          )}

          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => goTo(1)} className="press inline-flex h-12 items-center justify-center gap-2 rounded-full px-5 text-[0.9375rem] font-semibold text-ink hover:bg-ground-2">
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back
            </button>
            <button
              type="button"
              onClick={send}
              disabled={sending}
              className="press inline-flex h-14 items-center justify-center gap-2 rounded-full bg-board px-8 text-[1rem] font-semibold text-board-ink hover:bg-board-deep disabled:opacity-70"
            >
              {sending && <LoaderCircle aria-hidden="true" className="size-[1.125rem] animate-spin" />}
              {sending ? (orderId ? "Saving…" : "Sending…") : orderId ? "Save changes" : "Send request"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

/** The request's three steps as lamps on a small board: passed lit, current live. */
function StepStrip({ step, onPick }: { step: Step; onPick: (s: Step) => void }) {
  return (
    <div className="board rounded-[1.25rem] px-4 py-3 text-board-ink sm:px-5">
      <ol aria-label="Request steps" className="grid grid-cols-3 gap-2">
        {STEPS.map((name, i) => {
          const done = i < step;
          const live = i === step;
          const body = (
            <>
              <span aria-hidden="true" className="lamp shrink-0" data-state={live ? "live" : done ? "done" : undefined} />
              <span className={`truncate text-[0.875rem] ${live ? "font-semibold text-board-ink" : done ? "text-board-ink" : "text-board-ink-2"}`}>{name}</span>
            </>
          );
          return (
            <li key={name} aria-current={live ? "step" : undefined} className="min-w-0">
              {done ? (
                <button type="button" onClick={() => onPick(i as Step)} className="press -mx-1.5 flex items-center gap-2 rounded-full px-1.5 py-1 hover:bg-board-deep">
                  {body}
                  <span className="sr-only">, done. Go back to this step</span>
                </button>
              ) : (
                <span className="flex items-center gap-2 py-1">{body}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StepActions({
  onBack,
  onNext,
  nextLabel,
  busy = false,
  busyNote,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
  busy?: boolean;
  busyNote?: string;
}) {
  return (
    <div className="mt-10 flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
      {onBack ? (
        <button type="button" onClick={onBack} className="press inline-flex h-12 items-center justify-center gap-2 rounded-full px-5 text-[0.9375rem] font-semibold text-ink hover:bg-ground-2">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back
        </button>
      ) : (
        <span className="hidden sm:block" />
      )}
      <div className="flex flex-col items-stretch gap-2 sm:items-end">
        <button
          type="button"
          onClick={onNext}
          disabled={busy}
          className="press inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-7 text-[0.9375rem] font-semibold text-ground hover:opacity-90 disabled:opacity-60"
        >
          {nextLabel}
          <ArrowRight aria-hidden="true" className="size-4" />
        </button>
        {busy && busyNote && <p className="text-center text-[0.8125rem] text-ink-2 sm:text-right">{busyNote}</p>}
      </div>
    </div>
  );
}

function ReviewBlock({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
        <h3 className="text-[1.0625rem] font-semibold text-ink">{title}</h3>
        <button type="button" onClick={onEdit} className="press text-[0.9375rem] font-semibold text-ink underline underline-offset-4 hover:no-underline">
          Edit
        </button>
      </div>
      {children}
    </section>
  );
}

function ReviewRow({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-3 text-[0.9375rem]">
      <dt className="text-ink-2">{term}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

/** One garment: type, color, fit, a quantity box per size, and names and numbers. */
function GarmentCard({
  index,
  garment: g,
  error,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  garment: GarmentDraft;
  error?: string;
  canRemove: boolean;
  onChange: (p: Partial<GarmentDraft>) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const sizes = fitOf(g.fit).sizes;
  const pieces = piecesOf(g);
  const swatch = g.color.trim() ? garmentColor(g.color).body : null;

  const setQty = (size: string, raw: string) => {
    const n = Math.max(0, Math.min(999, Math.floor(Number(raw.replace(/\D/g, "")) || 0)));
    onChange({ qty: { ...g.qty, [size]: n } });
  };

  const pickGarment = (name: string) => {
    const known = GARMENTS.find((x) => x.name === name);
    // A garment that only comes in one size switches the run; switching back restores Adult.
    const fit: Fit = known?.fit === "one" ? "one" : g.fit === "one" ? "adult" : g.fit;
    onChange({ garment: name, fit, qty: fit === g.fit ? g.qty : {} });
  };

  return (
    <li
      // A garment with a problem wears the solid ink ring, like any field in error.
      className={`rounded-[1.25rem] px-4 pb-5 pt-4 outline-none sm:px-6 sm:pb-6 sm:pt-5 ${
        error ? "shadow-[inset_0_0_0_2px_var(--ink)]" : "shadow-[inset_0_0_0_1px_var(--line)]"
      }`}
      data-invalid={error ? "true" : undefined}
      tabIndex={error ? -1 : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[1rem] font-semibold text-ink">
          Garment {index + 1}
          {pieces > 0 && <span className="tabular font-normal text-ink-2"> · {pieces} pcs</span>}
        </h3>
        {canRemove && (
          <button type="button" onClick={onRemove} className="press -mr-2 inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[0.875rem] font-semibold text-ink-2 hover:bg-ground-2 hover:text-ink">
            <Trash2 aria-hidden="true" className="size-4" />
            Remove
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-garment`} className="text-[0.875rem] font-semibold text-ink">
            Garment
          </label>
          <div className="relative mt-1.5">
            <select
              id={`${id}-garment`}
              value={g.garment}
              onChange={(e) => pickGarment(e.target.value)}
              className="auth-input cursor-pointer appearance-none pl-4 pr-10"
            >
              {GARMENTS.map((x) => (
                <option key={x.name} value={x.name}>
                  {x.name}
                </option>
              ))}
              <option value={OTHER}>Other…</option>
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-ink-2" />
          </div>
          {g.garment === OTHER && (
            <input
              aria-label="What garment is it?"
              value={g.other}
              onChange={(e) => onChange({ other: e.target.value })}
              maxLength={60}
              placeholder="e.g. Cheerleading skirt"
              className={`auth-input mt-2 px-4 ${error && !g.other.trim() ? "is-error" : ""}`}
            />
          )}
        </div>
        <div>
          <label htmlFor={`${id}-color`} className="text-[0.875rem] font-semibold text-ink">
            Color <span className="font-normal text-ink-2">(optional)</span>
          </label>
          <div className="auth-input mt-1.5 flex items-center gap-3 px-4">
            <span
              aria-hidden="true"
              className="size-5 shrink-0 rounded-full shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_18%,transparent)]"
              style={{ background: swatch ?? "transparent" }}
            />
            <input
              id={`${id}-color`}
              list={`${id}-colors`}
              value={g.color}
              onChange={(e) => onChange({ color: e.target.value })}
              maxLength={40}
              placeholder="e.g. Royal / white"
              className="chip-input-field h-full min-w-0 flex-1 bg-transparent outline-none"
            />
            <datalist id={`${id}-colors`}>
              {COLOR_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>
      </div>

      <fieldset className="mt-5">
        <legend className="text-[0.875rem] font-semibold text-ink">Sizes</legend>
        <div role="group" aria-label="Fit" className="mt-2 grid w-full grid-cols-4 gap-1 rounded-full bg-ground-2 p-1 shadow-[inset_0_0_0_1px_var(--line)] sm:inline-grid sm:w-auto">
          {FITS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={g.fit === f.id}
              onClick={() => onChange({ fit: f.id, qty: f.id === g.fit ? g.qty : {} })}
              className={`press whitespace-nowrap rounded-full px-2 py-1.5 text-[0.8125rem] font-semibold sm:px-3.5 sm:text-[0.875rem] ${
                g.fit === f.id ? "bg-ink text-ground" : "text-ink-2 hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="order-run mt-3">
          {sizes.map((s) => {
            const value = g.qty[s] ?? 0;
            return (
              <label key={s} className="order-run-cell" data-filled={value > 0 ? "true" : undefined}>
                <span className="order-run-size">{s}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={value ? String(value) : ""}
                  placeholder="0"
                  onChange={(e) => setQty(s, e.target.value)}
                  onFocus={(e) => e.target.select()}
                  aria-label={`${s === "One size" ? "Pieces" : `Size ${s}`}, pieces`}
                  className="tabular"
                />
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-5">
        <label htmlFor={`${id}-notes`} className="text-[0.875rem] font-semibold text-ink">
          Names and numbers <span className="font-normal text-ink-2">(optional)</span>
        </label>
        <textarea
          id={`${id}-notes`}
          value={g.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          rows={3}
          maxLength={1000}
          placeholder={"One per line, e.g.\nDELA CRUZ 7 (M)\nREYES 23 (L)"}
          className="auth-input auth-input-grow mt-1.5 min-h-20 resize-y px-4 py-3 text-[0.9375rem] leading-relaxed"
        />
      </div>

      {error && (
        <p id={`${id}-error`} className={errorText}>
          {error}
        </p>
      )}
    </li>
  );
}
