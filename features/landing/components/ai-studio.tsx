"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { useAuth } from "@/features/shared/auth/components/auth-provider";

type Sample = {
  team: string;
  player: string;
  /** The studio picks that made it, as a customer would tap them. */
  picks: string[];
  colors: { name: string; hex: string }[];
  src: string;
  alt: string;
};

// Real designs from the AI studio (FLUX.2 [pro]), made from exactly these picks.
const SAMPLES: Sample[] = [
  {
    team: "Mayon Blazers",
    player: "Dela Cruz 23",
    picks: ["Basketball", "NBA cut", "Angular shards"],
    colors: [
      { name: "White", hex: "#F3F4F2" },
      { name: "Navy", hex: "#1D2A48" },
      { name: "Red", hex: "#C3302D" },
    ],
    src: "/landing/studio-shards.webp",
    alt: "A white sleeveless basketball jersey, front and back, with navy and red angular shards rising from the hem, MAYON BLAZERS and 23 on the front, DELA CRUZ and 23 on the back.",
  },
  {
    team: "Eagles",
    player: "Reyes 7",
    picks: ["Volleyball", "Paint fade"],
    colors: [
      { name: "Gold", hex: "#F2A900" },
      { name: "White", hex: "#F3F4F2" },
      { name: "Navy", hex: "#1D2A48" },
    ],
    src: "/landing/studio-fade.webp",
    alt: "A gold short-sleeve volleyball jersey, front and back, with navy shoulders and white wavy paint streaks, EAGLES and 7 on the front, REYES and 7 on the back.",
  },
  {
    team: "Mayon Blazers",
    player: "Villanueva 11",
    picks: ["Basketball", "Regular cut", "Brush strokes", "Team logo"],
    colors: [
      { name: "Maroon", hex: "#6A1F2B" },
      { name: "Gold", hex: "#F2C230" },
      { name: "White", hex: "#F3F4F2" },
    ],
    src: "/landing/studio-brush.webp",
    alt: "A maroon sleeveless basketball jersey, front and back, with gold diagonal brush strokes, the team logo on the left chest, MAYON BLAZERS and 11 on the front, VILLANUEVA and 11 on the back.",
  },
];

/**
 * The landing page's AI studio band: three real studio designs, each shown with the picks
 * that made it. Tapping a sample cross-fades the picture (all three are stacked, so nothing
 * jumps or loads late), and the button opens the studio (sign-in first for visitors).
 */
export function AiStudio() {
  const [active, setActive] = useState(0);
  const { username, isStaff, openAuth } = useAuth();
  const cta = "press mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-action px-6 text-[0.9375rem] font-semibold text-action-ink hover:bg-action-deep";
  const ctaLabel = (
    <>
      <Sparkles aria-hidden="true" className="size-4.5" />
      Try the AI studio
      <ArrowRight aria-hidden="true" className="size-4" />
    </>
  );

  return (
    <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14">
      <figure className="lg:order-2">
        {/* Cut-out garments (backgrounds removed), floating straight on the band. */}
        <div className="relative aspect-[3/2]">
          {SAMPLES.map((s, i) => (
            <Image
              key={s.src}
              src={s.src}
              alt={i === active ? s.alt : ""}
              aria-hidden={i !== active}
              width={1184}
              height={784}
              sizes="(min-width: 80rem) 44rem, (min-width: 64rem) 55vw, 100vw"
              // The first paints with the page; the others load right after, so a tap never fades into a blank.
              priority={i === 0}
              loading={i === 0 ? undefined : "eager"}
              className="landing-studio-shot absolute inset-0 size-full object-contain"
              data-on={i === active}
            />
          ))}
        </div>
        <figcaption className="mt-3 flex items-center justify-between gap-4 px-1 text-[0.875rem] text-ink-2">
          <span>Made in the AI studio, front and back</span>
          <span className="tabular">
            {active + 1} of {SAMPLES.length}
          </span>
        </figcaption>
      </figure>

      <div className="lg:order-1">
        <p id="studio-samples" className="voice-label mb-3 text-[0.8125rem] text-ink-2">
          Tap a sample
        </p>
        <div role="radiogroup" aria-labelledby="studio-samples" className="flex flex-col gap-2.5">
          {SAMPLES.map((s, i) => {
            const on = i === active;
            return (
              <button
                key={s.src}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setActive(i)}
                className={`press rounded-2xl px-5 py-4 text-left ${
                  on ? "bg-ink text-ground shadow-[0_10px_24px_-14px_oklch(0.2_0.02_50/0.6)]" : "bg-ground-2 text-ink hover:bg-line/60"
                }`}
              >
                <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="text-[1.0625rem] font-semibold">{s.team}</span>
                  <span className={`text-[0.875rem] ${on ? "text-ground/70" : "text-ink-2"}`}>{s.player}</span>
                </span>
                <span className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 flex -space-x-1" aria-label={`Colors: ${s.colors.map((c) => c.name).join(", ")}`}>
                    {s.colors.map((c) => (
                      <span
                        key={c.name}
                        aria-hidden="true"
                        className={`size-4.5 rounded-full shadow-[inset_0_0_0_1px_oklch(0_0_0/0.18),0_0_0_1.5px_var(--ring)] ${on ? "[--ring:var(--ink)]" : "[--ring:var(--ground-2)]"}`}
                        style={{ background: c.hex }}
                      />
                    ))}
                  </span>
                  {s.picks.map((p) => (
                    <span
                      key={p}
                      className={`rounded-full px-2.5 py-0.5 text-[0.8125rem] ${
                        on ? "shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ground)_30%,transparent)]" : "shadow-[inset_0_0_0_1px_var(--line)]"
                      }`}
                    >
                      {p}
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-5 max-w-[56ch] text-[0.9375rem] leading-relaxed text-ink-2">
          Pick the garment, cut, colors, and style, add your team name, player name, number, and logo, and the studio draws it
          front and back. Make three designs a day, saved to your account, and attach one to a custom order so the shop sees
          exactly what you mean.
        </p>
        {/* Customers go straight in; visitors create an account and land in the studio. Staff have no studio. */}
        {username && !isStaff ? (
          <Link href="/design" className={cta}>
            {ctaLabel}
          </Link>
        ) : !username ? (
          <button type="button" onClick={() => openAuth("signup", "", "/design")} aria-haspopup="dialog" className={cta}>
            {ctaLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
