"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FlipText } from "@/features/shared/ui/flip-text";
import { UsernameForm } from "./username-form";
import { ORDER_STAGES, PERIODS, SAMPLE_ORDER } from "@/features/landing/sample-data";

const ADVANCE_MS = 2600;
const WORD_CELLS = Math.max(...ORDER_STAGES.map((s) => s.word.length));

function BoardLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`voice-kicker block text-[0.6875rem] text-board-ink-2 ${className}`}>
      {children}
    </span>
  );
}

export function Scoreboard() {
  const [stage, setStage] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.35,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!autoplay || !visible || reduced) return;
    const t = window.setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      setStage((s) => (s + 1) % ORDER_STAGES.length);
    }, ADVANCE_MS);
    return () => window.clearTimeout(t);
  }, [stage, autoplay, visible, reduced]);

  const current = ORDER_STAGES[stage];

  const jumpToPeriod = (period: number) => {
    setAutoplay(false);
    const first = ORDER_STAGES.findIndex((s) => s.period === period);
    // Tapping the live period again steps through its remaining statuses.
    if (current.period === period) {
      const next = stage + 1;
      setStage(ORDER_STAGES[next]?.period === period ? next : first);
    } else {
      setStage(first);
    }
  };

  return (
    <div
      ref={boardRef}
      className="board relative isolate overflow-hidden rounded-[1.75rem] p-4 pt-6 text-board-ink sm:p-6 sm:pt-7 lg:rounded-[2.25rem] lg:p-8"
    >
      <div className="flex items-center justify-between gap-4 px-1">
        <BoardLabel>Sample order</BoardLabel>
        <span className="flex items-center gap-5">
          <span className="hidden items-center gap-2.5 lg:inline-flex">
            <BoardLabel>Ready by</BoardLabel>
            <FlipText text={SAMPLE_ORDER.readyBy} label={`Ready by ${SAMPLE_ORDER.readyBy}`} className="text-[1.375rem]" />
          </span>
          <span className="voice-label tabular text-[0.8125rem] text-board-ink">{SAMPLE_ORDER.number}</span>
        </span>
      </div>

      {/* Main readout */}
      <div className="mt-3 grid gap-4 lg:mt-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-end lg:gap-8">
        {/* Status: the center of the board */}
        <div className="order-1 min-w-0 lg:order-2">
          <BoardLabel className="mb-2 text-center">Status</BoardLabel>
          <div className="board-well rounded-2xl px-2 py-3 text-center sm:px-3 sm:py-4">
            <FlipText
              text={current.word}
              length={WORD_CELLS}
              align="center"
              label={`Order status: ${current.word}`}
              className="text-[min(8.4vw,2.9rem)] sm:text-[min(7.4vw,3.6rem)] lg:text-[min(4.6vw,4.4rem)]"
            />
          </div>
        </div>

        {/* Home */}
        <div className="order-2 flex min-w-0 items-end justify-between gap-4 lg:order-1 lg:block">
          <div className="min-w-0">
            <BoardLabel className="mb-1.5">Home</BoardLabel>
            <p className="voice-display truncate text-[clamp(1.35rem,3.4vw,2rem)] leading-none">{SAMPLE_ORDER.team}</p>
          </div>
          <div className="shrink-0 lg:mt-4">
            <BoardLabel className="mb-1.5 text-right lg:text-left">Pieces</BoardLabel>
            <FlipText text={String(SAMPLE_ORDER.pieces)} className="text-[2.25rem] lg:text-[2.75rem]" label={`${SAMPLE_ORDER.pieces} pieces`} />
          </div>
        </div>

        {/* Size run, ready date, and payment */}
        <div className="order-3 min-w-0 lg:text-right">
          <BoardLabel className="mb-1.5 lg:text-right">Size run</BoardLabel>
          <ul className="on-board flex gap-1 sm:gap-1.5 lg:justify-end" aria-label="Sizes in this order">
            {SAMPLE_ORDER.sizes.map((s) => (
              <li key={s.size} className="cell flex w-[2.4rem] flex-col items-center rounded-md py-1 sm:w-[2.9rem]">
                <span className="voice-label text-[0.6875rem] opacity-70">{s.size}</span>
                <span className="voice-board tabular text-[1.25rem] leading-none">{s.qty}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-end justify-between gap-6 lg:justify-end">
            <div className="lg:hidden">
              <BoardLabel className="mb-1.5">Ready by</BoardLabel>
              <FlipText
                text={SAMPLE_ORDER.readyBy}
                label={`Ready by ${SAMPLE_ORDER.readyBy}`}
                className="text-[1.875rem] sm:text-[2.25rem] lg:text-[2.25rem]"
              />
            </div>
            <div>
              <BoardLabel className="mb-1.5 text-right">Paid</BoardLabel>
              <FlipText
                text={`${current.paid}%`}
                length={4}
                align="end"
                label={`${current.paid} percent paid`}
                className="text-[1.875rem] sm:text-[2.25rem] lg:text-[2.25rem]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Periods */}
      <div className="mt-6 border-t border-board-line pt-5 lg:mt-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
          <ol className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:flex lg:gap-2" aria-label="Order periods">
            {PERIODS.map((p, i) => {
              const state = i < current.period ? "done" : i === current.period ? "live" : "idle";
              return (
                <li key={p}>
                  <button
                    type="button"
                    onClick={() => jumpToPeriod(i)}
                    aria-pressed={state === "live"}
                    className="press flex w-full items-center gap-2.5 whitespace-nowrap rounded-full px-3 py-2 text-left text-[0.9375rem] font-medium text-board-ink hover:bg-board-deep/70"
                  >
                    <span className="lamp shrink-0" data-state={state} aria-hidden="true" />
                    {p}
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="min-h-[2.75rem] max-w-[46ch] text-[0.9375rem] leading-snug text-board-ink-2 lg:text-right" aria-live="off">
            <span className="tabular font-semibold text-board-ink">{current.stamp}</span>
            <span aria-hidden="true"> · </span>
            {current.detail}
          </p>
        </div>
      </div>

      {/* Control strip */}
      <div className="board-well -mx-4 -mb-4 mt-6 rounded-b-[1.75rem] px-4 pb-5 pt-5 sm:-mx-6 sm:-mb-6 sm:px-6 lg:-mx-8 lg:-mb-8 lg:mt-7 lg:rounded-b-[2.25rem] lg:px-8 lg:pb-7 lg:pt-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
          <div className="w-full lg:max-w-[34rem]">
            <UsernameForm tone="board" label="Start your own board: pick a username" />
          </div>
          <Link
            href="/shop"
            className="press group inline-flex items-center gap-2 self-start rounded-full px-1 py-2 text-[1rem] font-semibold text-board-ink hover:underline lg:mb-7 lg:self-auto"
          >
            Browse the shop
            <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
