'use client';

import {
    type DesignPicks,
  } from "@/features/customer/design/model";
import { swatchOf } from '../reusable/design-reusable'

export function EmptyStageNote({ picks, live }: { picks: DesignPicks; live: boolean }) {
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