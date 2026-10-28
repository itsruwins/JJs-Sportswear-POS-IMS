"use client";

import { useState } from "react";
import { Jersey, type JerseyDesign } from "./garments";

type Preset = { prompt: string; design: JerseyDesign };

const PRESETS: Preset[] = [
  {
    prompt: "Black and amber, a lava stripe across the chest like Mayon at night, number 23.",
    design: {
      body: "oklch(0.21 0.01 158)",
      panel: "oklch(0.3 0.01 158)",
      trim: "oklch(0.82 0.165 78)",
      ink: "oklch(0.97 0.01 78)",
      accent: "oklch(0.64 0.2 38)",
      pattern: "lava",
      name: "BLAZERS",
      number: "23",
    },
  },
  {
    prompt: "Clean white with deep blue side panels and waves along the hem, number 7.",
    design: {
      body: "oklch(0.97 0.004 240)",
      panel: "oklch(0.38 0.12 255)",
      trim: "oklch(0.38 0.12 255)",
      ink: "oklch(0.3 0.11 255)",
      accent: "oklch(0.62 0.12 230)",
      pattern: "tide",
      name: "TIDE",
      number: "7",
    },
  },
  {
    prompt: "Court green with thin gold pinstripes, old-school varsity lettering, number 11.",
    design: {
      body: "oklch(0.43 0.105 158)",
      panel: "oklch(0.34 0.085 158)",
      trim: "oklch(0.86 0.12 90)",
      ink: "oklch(0.97 0.02 95)",
      accent: "oklch(0.86 0.12 90)",
      pattern: "pinstripe",
      name: "KINGS",
      number: "11",
    },
  },
];

export function AiStudio() {
  const [active, setActive] = useState(0);
  const [attempt, setAttempt] = useState(1);
  const preset = PRESETS[active];

  return (
    <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-16">
      <div>
        <p id="studio-prompts" className="voice-label mb-3 text-[0.8125rem] text-ink-2">
          Try a sample prompt
        </p>
        <div role="radiogroup" aria-labelledby="studio-prompts" className="flex flex-col gap-2.5">
          {PRESETS.map((p, i) => {
            const on = i === active;
            return (
              <button
                key={p.design.name}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  if (!on) {
                    setActive(i);
                    setAttempt((a) => a + 1);
                  }
                }}
                className={`press rounded-2xl px-5 py-4 text-left text-[1.0625rem] leading-snug ${
                  on
                    ? "bg-ink text-ground shadow-[0_10px_24px_-14px_oklch(0.2_0.02_50/0.6)]"
                    : "bg-ground-2 text-ink hover:bg-line/60"
                }`}
              >
                “{p.prompt}”
              </button>
            );
          })}
        </div>
        <p className="mt-5 max-w-[56ch] text-[0.9375rem] leading-relaxed text-ink-2">
          These are sample previews. In your account, the studio generates designs from your own words and saves every
          attempt, and you can attach a design to a custom order so staff see exactly what you mean.
        </p>
      </div>

      <figure className="relative mx-auto w-full max-w-[26rem]">
        <div className="relative rounded-[2rem] bg-ground-2 px-8 pb-6 pt-10 shadow-[inset_0_0_0_1px_var(--line)]">
          <Jersey design={preset.design} className="mx-auto w-full max-w-[19rem]" />
        </div>
        <figcaption className="mt-3 flex items-center justify-between px-1 text-[0.875rem] text-ink-2">
          <span>Sample preview</span>
          <span className="tabular">Attempt {attempt}</span>
        </figcaption>
      </figure>
    </div>
  );
}
