import { MessageCircle } from "lucide-react";
import { ORDER_STAGES, SAMPLE_ORDER } from "./data";

/** The custom-order lifecycle as one continuous ruled band, stamped like the order's status history. */
export function OrderBand() {
  return (
    <div>
      <div className="relative">
        {/* The rule: horizontal on desktop, vertical on phones */}
        <span
          aria-hidden="true"
          className="absolute bottom-2 left-[0.4375rem] top-2 w-0.5 bg-board-text md:bottom-auto md:left-0 md:right-0 md:top-[0.4375rem] md:h-0.5 md:w-auto"
        />
        <ol className="relative grid gap-9 md:grid-cols-6 md:gap-5">
          {ORDER_STAGES.map((s, i) => {
            const last = i === ORDER_STAGES.length - 1;
            return (
              <li key={s.word} className="relative pl-9 md:pl-0 md:pt-9">
                <span
                  aria-hidden="true"
                  className={`absolute left-0 top-1 size-4 rounded-full border-2 border-board-text md:top-0 ${
                    last ? "bg-board-text" : "bg-ground"
                  }`}
                />
                <p className="tabular text-[0.8125rem] text-ink-2">
                  <time>{s.stamp}</time>
                </p>
                <h3 className="voice-board mt-1.5 text-[1.625rem] uppercase leading-none text-ink">{s.word}</h3>
                <p className="mt-1 text-[0.9375rem] font-semibold text-ink">{s.title}</p>
                <p className="mt-2 max-w-[38ch] text-[0.9375rem] leading-relaxed text-ink-2">{s.detail}</p>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 text-[0.9375rem] text-ink-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2.5">
          <MessageCircle aria-hidden="true" className="mt-0.5 size-[1.1rem] shrink-0 text-board-text" strokeWidth={2} />
          <span>Questions along the way go to the chat inside your order, so the whole conversation stays with it.</span>
        </p>
        <p className="tabular shrink-0">Sample timeline · order {SAMPLE_ORDER.number}</p>
      </div>
    </div>
  );
}
