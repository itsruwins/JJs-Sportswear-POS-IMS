"use client";

import { uuid } from "@/lib/uuid";
import { useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ImagePlus, LoaderCircle, Plus, Sparkles, X } from "lucide-react";
import { prepareForUpload } from "@/features/shared/photos/prepare-upload";
import { garmentColor } from "@/features/shared/catalog/colors";
import type { MyDesign } from "@/features/customer/design/data";
import {
  blankPicks,
  blankSrc,
  colorHex,
  CUTS,
  DESIGNS_PER_DAY,
  garmentShape,
  hasCutChoice,
  isHexColor,
  MAX_COLORS,
  MAX_EXTRA,
  picksSummary,
  STUDIO_GARMENTS,
  STUDIO_SPORTS,
  STUDIO_STYLES,
  type DesignPicks,
} from "@/features/customer/design/model";
import { COLOR_SUGGESTIONS } from "@/features/customer/orders/model";
import { createClient } from "@/lib/supabase/client";
import { generateDesign, refineDesign } from "@/features/customer/design/actions";

const label = "text-[0.9375rem] font-semibold text-ink";
const COLOR_ROLES = ["Main", "Second", "Accent"];

function when(iso: string) {
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }).format(new Date(iso));
}

/** Today's tries as lamps on a small board: lit = still available. */
function TriesLeft({ left }: { left: number }) {
  return (
    <div className="board inline-flex items-center gap-3 rounded-full px-4 py-2 text-board-ink" role="status">
      <span className="flex gap-1.5" aria-hidden="true">
        {Array.from({ length: DESIGNS_PER_DAY }, (_, i) => (
          <span key={i} className="lamp" data-state={i < left ? "done" : undefined} />
        ))}
      </span>
      <span className="text-[0.875rem] font-semibold">
        <span className="tabular">{left}</span> of {DESIGNS_PER_DAY} left today
      </span>
    </div>
  );
}

function ChipGroup<T extends string>({ name, options, value, onPick }: { name: string; options: readonly T[] | { id: T; label: string }[]; value: T; onPick: (v: T) => void }) {
  const list = (options as readonly (T | { id: T; label: string })[]).map((o) => (typeof o === "string" ? { id: o, label: o } : o));
  return (
    <fieldset>
      <legend className={label}>{name}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {list.map((o) => (
          <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onPick(o.id)} className="shop-chip press h-9 px-3.5 text-[0.875rem]">
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** A picked color as CSS: an exact hex as is, a swatch name through the shop's palette. */
const swatchOf = (c: string) => (isHexColor(c) ? c : garmentColor(c).body);

/**
 * Under the stage before the first design: the picked colors, and what Generate will make.
 * The stage itself shows the blank garment the AI prints on (it follows the garment, sport,
 * and cut).
 */
function EmptyStageNote({ picks, live }: { picks: DesignPicks; live: boolean }) {
  return (
    <div className="mt-4 flex items-center gap-3">
      {picks.colors.length > 0 && (
        <ul className="flex shrink-0 -space-x-1.5" aria-label="Your colors">
          {picks.colors.map((c) => (
            <li
              key={c}
              title={c}
              className="size-6 rounded-full shadow-[inset_0_0_0_1px_oklch(0_0_0/0.15),0_0_0_2px_var(--ground)]"
              style={{ background: swatchOf(c) }}
            >
              <span className="sr-only">{c}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="min-w-0 text-[0.875rem] leading-snug text-ink-2">
          {live ? (
            <>
              <span className="font-semibold text-ink">Your design is printed on this garment.</span> Generate to see it front and back.
            </>
          ) : (
            <>
              <span className="font-semibold text-ink">The AI designer is coming soon.</span> Your picks are kept for when it’s on.
            </>
          )}
      </p>
    </div>
  );
}

/**
 * The AI design studio: guided picks and free text become a FLUX prompt; each design shows
 * front and back. Three designs a day (refinements count), saved to the customer's gallery,
 * and one tap starts a custom-order request with the design attached.
 */
export function Studio({
  uid,
  designs,
  usedToday,
  live,
  savedLogoUrl,
}: {
  uid: string;
  designs: MyDesign[];
  usedToday: number;
  /** True when the shop's FLUX key is set; without it nothing can be generated. */
  live: boolean;
  /** Signed link to the logo restored with the last design's picks. */
  savedLogoUrl: string | null;
}) {
  const router = useRouter();
  const ids = { team: useId(), player: useId(), number: useId(), extra: useId(), refine: useId() };
  const [picks, setPicks] = useState<DesignPicks>(() => {
    const last = designs[0]?.details;
    return last ? { ...blankPicks(), ...last, extra: "", logoPath: last.logoPath ?? null } : blankPicks();
  });
  /** While the custom color picker is open, the slot its color fills (it fires on every drag). */
  const customSlot = useRef<number | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(savedLogoUrl);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<"generate" | "refine" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(designs[0]?.id ?? null);
  const [refineText, setRefineText] = useState("");
  const stageRef = useRef<HTMLElement>(null);

  const left = Math.max(0, DESIGNS_PER_DAY - usedToday);
  // A new design arrives with the refreshed list; until then the newest shows.
  const current = designs.find((d) => d.id === selectedId) ?? designs[0] ?? null;

  const patch = (p: Partial<DesignPicks>) => {
    setPicks((x) => ({ ...x, ...p }));
    setError(null);
  };

  const toggleColor = (c: string) => {
    const has = picks.colors.includes(c);
    if (has) return patch({ colors: picks.colors.filter((x) => x !== c) });
    if (picks.colors.length >= MAX_COLORS) return setError(`Pick up to ${MAX_COLORS} colors. Tap one to remove it.`);
    patch({ colors: [...picks.colors, c] });
  };

  /** The custom picker: the first change adds a color, later ones (while it's open) adjust it. */
  const pickCustom = (raw: string) => {
    const hex = raw.toUpperCase();
    const slot = customSlot.current;
    if (slot !== null && slot < picks.colors.length) {
      if (picks.colors.some((c, i) => i !== slot && colorHex(c) === hex)) return;
      return patch({ colors: picks.colors.map((c, i) => (i === slot ? hex : c)) });
    }
    if (picks.colors.some((c) => colorHex(c) === hex)) return;
    if (picks.colors.length >= MAX_COLORS) return setError(`Pick up to ${MAX_COLORS} colors. Remove one to add your own.`);
    customSlot.current = picks.colors.length;
    patch({ colors: [...picks.colors, hex] });
  };

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { blob, ext, type } = await prepareForUpload(file);
      const path = `${uid}/logos/${uuid()}.${ext}`;
      const { error: upErr } = await createClient().storage.from("ai-designs").upload(path, blob, { contentType: type });
      if (upErr) throw new Error("The logo didn’t upload. Check your connection and try again.");
      patch({ logoPath: path });
      setLogoUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The logo didn’t upload. Try another picture.");
    } finally {
      setUploading(false);
    }
  };

  const showStage = () => requestAnimationFrame(() => stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));

  const generate = async () => {
    if (picks.colors.length === 0) return setError("Pick at least one color.");
    setBusy("generate");
    setError(null);
    showStage();
    const result = await generateDesign(picks);
    setBusy(null);
    if (!result.ok) return setError(result.message);
    setSelectedId(result.id);
    router.refresh();
  };

  const refine = async () => {
    if (!current) return;
    if (refineText.trim().length < 3) return setError("Say what to change, like “make the stripes thinner”.");
    setBusy("refine");
    setError(null);
    const result = await refineDesign(current.id, refineText);
    setBusy(null);
    if (!result.ok) return setError(result.message);
    setRefineText("");
    setSelectedId(result.id);
    router.refresh();
  };

  const disabled = !live || left === 0 || busy !== null;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:gap-12">
      {/* Builder */}
      {/* Phones: with no designs yet the picks come first; after that, the stage leads. */}
      <section aria-labelledby="builder-title" className={`${designs.length ? "order-2" : "order-1"} lg:order-1`}>
        <h2 id="builder-title" className="sr-only">
          Describe your design
        </h2>
        <div className="flex flex-col gap-6">
          <ChipGroup name="Garment" options={STUDIO_GARMENTS} value={picks.garment as (typeof STUDIO_GARMENTS)[number]} onPick={(v) => patch({ garment: v })} />
          <ChipGroup name="Sport" options={STUDIO_SPORTS} value={picks.sport as (typeof STUDIO_SPORTS)[number]} onPick={(v) => patch({ sport: v })} />
          {hasCutChoice(picks) && (
            <div>
              <ChipGroup name="Cut" options={CUTS} value={picks.cut} onPick={(v) => patch({ cut: v })} />
              <p className="mt-2 text-[0.8125rem] text-ink-2">NBA cut has side panels and a V-neck; regular has plain sides and a round neck.</p>
            </div>
          )}

          <fieldset>
            <legend className={label}>
              Colors <span className="font-normal text-ink-2">(up to {MAX_COLORS}, main first)</span>
            </legend>
            <div className="mt-2.5 flex flex-wrap gap-2.5">
              {COLOR_SUGGESTIONS.map((c) => {
                const at = picks.colors.indexOf(c);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={at !== -1}
                    aria-label={at !== -1 ? `${c}, ${COLOR_ROLES[at].toLowerCase()} color` : c}
                    title={c}
                    onClick={() => toggleColor(c)}
                    className="shop-swatch studio-swatch press"
                    style={{ "--swatch": garmentColor(c).body } as React.CSSProperties}
                  >
                    {at !== -1 && <span className="studio-swatch-rank tabular">{at + 1}</span>}
                  </button>
                );
              })}
              <label title="Pick an exact color" className="shop-swatch studio-swatch studio-swatch-custom press cursor-pointer focus-within:shadow-[0_0_0_3px_var(--ground),0_0_0_5px_var(--focus)]">
                <Plus aria-hidden="true" className="size-4 text-ink" />
                <input
                  type="color"
                  aria-label="Pick an exact color"
                  value={picks.colors.find(isHexColor) ?? "#2747A8"}
                  onClick={() => (customSlot.current = null)}
                  onChange={(e) => pickCustom(e.target.value)}
                  onBlur={() => (customSlot.current = null)}
                  className="sr-only"
                />
              </label>
            </div>
            {picks.colors.length ? (
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Your colors">
                {picks.colors.map((c, i) => (
                  <li key={c}>
                    <button
                      type="button"
                      onClick={() => patch({ colors: picks.colors.filter((x) => x !== c) })}
                      aria-label={`Remove ${c}, the ${COLOR_ROLES[i].toLowerCase()} color`}
                      className="press inline-flex h-8 items-center gap-2 rounded-full pr-2.5 pl-1.5 text-[0.8125rem] text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2"
                    >
                      <span aria-hidden="true" className="size-5 rounded-full shadow-[inset_0_0_0_1px_oklch(0_0_0/0.15)]" style={{ background: swatchOf(c) }} />
                      <span>
                        <span className="text-ink-2">{COLOR_ROLES[i]}:</span> <span className={`font-semibold ${isHexColor(c) ? "tabular" : ""}`}>{c}</span>
                      </span>
                      <X aria-hidden="true" className="size-3.5 text-ink-2" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2.5 text-[0.8125rem] text-ink-2">No colors picked yet.</p>
            )}
          </fieldset>

          <ChipGroup name="Style" options={STUDIO_STYLES as unknown as { id: DesignPicks["style"]; label: string }[]} value={picks.style} onPick={(v) => patch({ style: v })} />

          <div>
            <label htmlFor={ids.team} className={label}>
              Team name <span className="font-normal text-ink-2">(front)</span>
            </label>
            <input id={ids.team} value={picks.team} maxLength={24} onChange={(e) => patch({ team: e.target.value })} placeholder="e.g. Mayon Blazers" className="auth-input mt-2 px-4" />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
            <div>
              <label htmlFor={ids.player} className={label}>
                Name <span className="font-normal text-ink-2">(back)</span>
              </label>
              <input id={ids.player} value={picks.playerName} maxLength={16} onChange={(e) => patch({ playerName: e.target.value })} placeholder="e.g. Dela Cruz" className="auth-input mt-2 px-4" />
            </div>
            <div>
              <label htmlFor={ids.number} className={label}>
                Number
              </label>
              <input
                id={ids.number}
                value={picks.number}
                inputMode="numeric"
                maxLength={3}
                onChange={(e) => patch({ number: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                placeholder="23"
                className="auth-input tabular mt-2 px-4"
              />
            </div>
          </div>
          <label className="-mt-3 flex cursor-pointer items-center gap-2.5 text-[0.9375rem] text-ink">
            <input type="checkbox" checked={picks.frontNumber} onChange={(e) => patch({ frontNumber: e.target.checked })} className="scan-check" />
            Number on the front too, under the team name
          </label>

          <div>
            <p className={label}>
              Team logo <span className="font-normal text-ink-2">(optional)</span>
            </p>
            {picks.logoPath ? (
              <div className="mt-2 flex items-center gap-3">
                <div className="shop-tile grid size-16 place-items-center rounded-xl">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="Your team logo" className="size-full object-contain p-1.5" />
                  ) : (
                    <span className="text-[0.75rem] text-card-ink/70">Logo</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    patch({ logoPath: null });
                    setLogoUrl(null);
                  }}
                  className="press inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[0.875rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2"
                >
                  <X aria-hidden="true" className="size-4" />
                  Remove
                </button>
              </div>
            ) : (
              <label className="press mt-2 flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl text-[0.9375rem] font-semibold text-ink-2 shadow-[inset_0_0_0_1.5px_var(--line)] hover:text-ink focus-within:shadow-[0_0_0_2px_var(--focus)]">
                {uploading ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : <ImagePlus aria-hidden="true" className="size-5" />}
                {uploading ? "Uploading…" : "Add your logo"}
                <input type="file" accept="image/*" className="sr-only" disabled={uploading} onChange={(e) => { pickLogo(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            )}
          </div>

          <div>
            <label htmlFor={ids.extra} className={label}>
              Anything else? <span className="font-normal text-ink-2">(optional)</span>
            </label>
            <textarea
              id={ids.extra}
              value={picks.extra}
              maxLength={MAX_EXTRA}
              rows={3}
              onChange={(e) => patch({ extra: e.target.value })}
              placeholder="e.g. a flame pattern on the sides, gold trim on the collar"
              className="auth-input auth-input-grow mt-2 min-h-20 resize-y px-4 py-3 leading-relaxed"
            />
          </div>

          <div>
            <button
              type="button"
              onClick={generate}
              disabled={disabled || uploading}
              className="press inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-action px-6 text-[1rem] font-semibold text-action-ink hover:bg-action-deep disabled:bg-ground-2 disabled:text-ink-2 disabled:shadow-[inset_0_0_0_1px_var(--line)]"
            >
              {busy === "generate" ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : <Sparkles aria-hidden="true" className="size-5" />}
              {busy === "generate" ? "Drawing your design…" : !live ? "Coming soon" : left === 0 ? "No designs left today" : "Generate design"}
            </button>
            <p className="mt-2 text-center text-[0.8125rem] text-ink-2">
              {!live ? "The shop is still turning the AI on." : left === 0 ? "You can make 3 more tomorrow." : `Uses 1 of today’s ${DESIGNS_PER_DAY}.`}
            </p>
          </div>
        </div>
      </section>

      {/* Stage + gallery */}
      <section ref={stageRef} aria-labelledby="stage-title" className={`${designs.length ? "order-1" : "order-2"} min-w-0 scroll-mt-24 lg:order-2`}>
        <h2 id="stage-title" className="sr-only">
          Your design
        </h2>
        <div className="shop-tile aspect-[3/2] w-full">
          {busy ? (
            <div className="grid size-full place-items-center p-6 text-center" role="status">
              <div>
                <LoaderCircle aria-hidden="true" className="mx-auto size-8 animate-spin text-card-ink/60" />
                <p className="mt-3 text-[1rem] font-semibold text-card-ink">{busy === "refine" ? "Refining your design…" : "Drawing your design…"}</p>
                <p className="mt-1 text-[0.875rem] text-card-ink/70">This takes about 10 to 30 seconds.</p>
              </div>
            </div>
          ) : current?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.url} alt={`Design: ${picksSummary(current.details) ?? current.prompt}`} className="size-full object-contain" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={blankSrc(garmentShape(picks))} alt={`A blank ${picks.garment.toLowerCase()}, front and back, that your design is printed on`} className="size-full object-contain" />
          )}
        </div>
        {!busy && !current && <EmptyStageNote picks={picks} live={live} />}

        {error && (
          <p role="alert" className="auth-alert mt-4 rounded-2xl px-5 py-3.5 text-[0.9375rem]">
            {error}
          </p>
        )}

        {current && !busy && (
          <div className="mt-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[1.0625rem] font-semibold text-ink">{current.details?.team || picksSummary(current.details) || "Your design"}</p>
                <p className="mt-0.5 text-[0.875rem] text-ink-2">
                  {[picksSummary(current.details), when(current.createdAt), current.parentId ? "Refined" : null, current.isPreview ? "Preview" : null].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
              <Link
                href={`/orders/new?design=${current.id}`}
                className="press inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-action px-6 text-[0.9375rem] font-semibold text-action-ink hover:bg-action-deep"
              >
                Use this design
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              {live ? (
                <div className="min-w-0 flex-1">
                  <label htmlFor={ids.refine} className="text-[0.875rem] font-semibold text-ink">
                    Refine it <span className="font-normal text-ink-2">(uses 1 of today’s {DESIGNS_PER_DAY})</span>
                  </label>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      id={ids.refine}
                      value={refineText}
                      maxLength={200}
                      onChange={(e) => setRefineText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !disabled && refine()}
                      placeholder="e.g. make the stripes thinner, use maroon"
                      disabled={disabled}
                      className="auth-input h-12 min-w-0 flex-1 px-4 text-[0.9375rem] disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={refine}
                      disabled={disabled || refineText.trim().length < 3}
                      className="press inline-flex h-12 shrink-0 items-center rounded-full px-5 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--ink)] hover:bg-ground-2 disabled:opacity-50"
                    >
                      Refine
                    </button>
                  </div>
                </div>
              ) : (
                <p className="min-w-0 flex-1 text-[0.875rem] leading-relaxed text-ink-2 sm:pb-1">
                  Refining with words comes when the AI is on.
                </p>
              )}
            </div>
          </div>
        )}

        {designs.length > 0 && (
          <div className="mt-10">
            <h3 className="voice-display border-b border-line pb-3 text-[1.5rem]">Your designs</h3>
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {designs.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(d.id)}
                    aria-pressed={current?.id === d.id}
                    className="studio-thumb press block w-full text-left"
                  >
                    <span className="shop-tile block aspect-[3/2]">
                      {d.url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={d.url} alt="" className="size-full object-contain" />
                      )}
                    </span>
                    <span className="mt-1.5 block truncate px-0.5 text-[0.8125rem] font-semibold text-ink">{d.details?.team || picksSummary(d.details) || "Design"}</span>
                    <span className="block px-0.5 text-[0.75rem] text-ink-2">
                      {when(d.createdAt)}
                      {d.parentId ? " · Refined" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

export { TriesLeft };
