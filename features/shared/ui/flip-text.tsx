"use client";

import { useState, type CSSProperties } from "react";

type FlipCharProps = {
  char: string;
  delay: number;
};

function FlipChar({ char, delay }: FlipCharProps) {
  const [shown, setShown] = useState({ current: char, previous: char, flips: 0 });

  // Adjust state while rendering when the target changes, so the flap always
  // starts from whatever card is on screen right now (interruptible).
  if (char !== shown.current) {
    setShown({ current: char, previous: shown.current, flips: shown.flips + 1 });
  }

  const { current, previous, flips } = shown;
  const style = { "--delay": `${delay}ms` } as CSSProperties;
  const blank = (c: string) => (c === " " ? " " : c);

  return (
    <span className="flap" data-blank={current === " "} aria-hidden="true">
      <span className="flap-half flap-top">
        <span>{blank(current)}</span>
      </span>
      <span className="flap-half flap-bottom">
        <span>{blank(flips > 0 ? previous : current)}</span>
      </span>
      {flips > 0 && (
        <>
          <span key={`fall-${flips}`} className="flap-half flap-top flap-fall" style={style}>
            <span>{blank(previous)}</span>
          </span>
          <span key={`rise-${flips}`} className="flap-half flap-bottom flap-rise" style={style}>
            <span>{blank(current)}</span>
          </span>
        </>
      )}
    </span>
  );
}

type FlipTextProps = {
  text: string;
  /** Pad to a fixed number of cards so the board never reflows. */
  length?: number;
  align?: "start" | "center" | "end";
  stagger?: number;
  className?: string;
  label?: string;
};

export function FlipText({
  text,
  length,
  align = "start",
  stagger = 28,
  className = "",
  label,
}: FlipTextProps) {
  const size = Math.max(length ?? text.length, text.length);
  const gap = size - text.length;
  const lead = align === "center" ? Math.floor(gap / 2) : align === "end" ? gap : 0;
  const cells = (" ".repeat(lead) + text).padEnd(size, " ").split("");

  return (
    <span className={`voice-board inline-flex gap-[0.06em] ${className}`}>
      <span className="sr-only">{label ?? text}</span>
      {cells.map((c, i) => (
        <FlipChar key={i} char={c} delay={i * stagger} />
      ))}
    </span>
  );
}
