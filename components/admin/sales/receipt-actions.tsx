"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, LoaderCircle, Printer } from "lucide-react";
import { voidSale } from "@/app/admin/pos/actions";

type Paper = "thermal" | "a4";

// The page size can't be switched by a selector, so it's set for this one print and removed after.
// @page rules merge property by property, so each also clears the inventory report's A4 size and footer.
const PAGE: Record<Paper, string> = {
  // size: auto leaves the paper to the printer (the 80 mm roll); the receipt itself is 72 mm wide.
  thermal: "@page { size: auto; margin: 3mm 4mm; @bottom-left { content: none } @bottom-right { content: none } }",
  a4: "@page { size: A4; margin: 16mm; @bottom-left { content: none } @bottom-right { content: none } }",
};

/** Sets up the page for one print and tidies up afterwards. */
function preparePaper(paper: Paper) {
  const html = document.documentElement;
  const style = document.createElement("style");
  style.textContent = PAGE[paper];
  document.head.appendChild(style);
  html.dataset.paper = paper;
  const done = () => {
    style.remove();
    delete html.dataset.paper;
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
}

function printOn(paper: Paper) {
  preparePaper(paper);
  window.print();
}

const outline =
  "press inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2 disabled:opacity-60";

export function PrintButtons({ primary = false }: { primary?: boolean }) {
  // Ctrl+P / ⌘P on a receipt prints the receipt layout too, not the inventory report's page.
  useEffect(() => {
    const before = () => {
      if (!document.documentElement.dataset.paper) preparePaper("thermal");
    };
    window.addEventListener("beforeprint", before);
    return () => window.removeEventListener("beforeprint", before);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => printOn("thermal")}
        className={
          primary
            ? "press inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-board px-4 text-[0.9375rem] font-semibold text-board-ink hover:bg-board-deep"
            : outline
        }
      >
        <Printer aria-hidden="true" className="size-4" />
        Print receipt
      </button>
      <button type="button" onClick={() => printOn("a4")} className={outline}>
        Print on A4
      </button>
    </>
  );
}

/** Owner only: void a sale with a reason. Stock goes back; the sale stays on record, marked void. */
export function VoidSaleButton({ saleId, receiptNumber }: { saleId: string; receiptNumber: string }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  // The close handler reads this, not state, so it never sees a stale "saving".
  const busyRef = useRef(false);
  const [error, setError] = useState("");

  const working = (on: boolean) => {
    busyRef.current = on;
    setBusy(on);
  };

  const confirm = async () => {
    if (busyRef.current || reason.trim().length < 3) return;
    working(true);
    setError("");
    try {
      const result = await voidSale(saleId, reason);
      working(false);
      if (!result.ok) return setError(result.message);
      ref.current?.close();
      router.refresh();
    } catch {
      working(false);
      setError("We couldn’t reach the server. Nothing changed; try again.");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setReason("");
          setError("");
          ref.current?.showModal();
        }}
        className={outline}
      >
        <Ban aria-hidden="true" className="size-4" />
        Void sale
      </button>
      <dialog
        ref={ref}
        className="auth-dialog"
        aria-labelledby="void-title"
        onCancel={(e) => busyRef.current && e.preventDefault()}
        onClose={() => {
          // A repeated Escape can't always be cancelled; while the void is saving, the dialog stays.
          if (busyRef.current) ref.current?.showModal();
        }}
      >
        <form
          className="auth-sheet px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-7 sm:pb-7"
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
        >
          <h2 id="void-title" className="voice-display text-[1.875rem]">
            Void {receiptNumber}?
          </h2>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-2">
            Every item goes back into stock, and the sale is marked void. It stays in Sales, so the record is complete. This
            can’t be undone.
          </p>
          <label htmlFor="void-reason" className="mt-5 block text-[0.875rem] font-semibold text-ink">
            Why is it being voided?
          </label>
          <textarea
            id="void-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder="Wrong size rung up, customer changed their mind…"
            className="auth-input auth-input-grow mt-2 min-h-24 resize-none px-4 py-3 leading-relaxed"
          />
          {error && (
            <p role="alert" className="auth-alert mt-4 rounded-xl px-4 py-3 text-[0.9375rem]">
              {error}
            </p>
          )}
          <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => ref.current?.close()} disabled={busy} className={outline}>
              Keep the sale
            </button>
            <button
              type="submit"
              disabled={busy || reason.trim().length < 3}
              className="press inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-ink px-5 text-[0.9375rem] font-semibold text-ground hover:opacity-90 disabled:opacity-50"
            >
              {busy && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
              Void sale
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
