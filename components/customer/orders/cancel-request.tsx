"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { cancelRequest } from "@/app/(customer)/orders/actions";

/** Cancel a request the shop hasn't accepted yet, with an optional reason the shop reads. */
export function CancelRequest({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reasonId = useId();

  const close = () => {
    if (!busy) dialog.current?.close();
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const result = await cancelRequest(orderId, reason);
    setBusy(false);
    if (!result.ok) return setError(result.message);
    dialog.current?.close();
    router.refresh();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="press inline-flex h-12 items-center justify-center rounded-full px-5 text-[0.9375rem] font-semibold text-ink hover:bg-ground-2"
      >
        Cancel request
      </button>
      <dialog
        ref={dialog}
        className="auth-dialog"
        aria-labelledby={`${reasonId}-title`}
        onCancel={(e) => busy && e.preventDefault()}
        onClick={(e) => e.target === e.currentTarget && close()}
      >
        <div className="auth-sheet px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-7 sm:pb-7">
          <div className="flex items-start justify-between gap-4">
            <h2 id={`${reasonId}-title`} className="voice-display text-[1.875rem]">
              Cancel this request?
            </h2>
            <button type="button" onClick={close} className="press -mr-2 -mt-1 grid size-10 place-items-center rounded-full text-ink-2 hover:bg-ground-2 hover:text-ink">
              <X aria-hidden="true" className="size-5" />
              <span className="sr-only">Keep the request</span>
            </button>
          </div>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-2">
            <span className="tabular font-semibold text-ink">{orderNumber}</span> stops here and the shop won’t price it. To order again
            later, send a new request.
          </p>
          <label htmlFor={reasonId} className="mt-5 block text-[0.9375rem] font-semibold text-ink">
            Why? <span className="font-normal text-ink-2">(optional, the shop sees this)</span>
          </label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="We found another supplier, the event moved…"
            className="auth-input auth-input-grow mt-2 min-h-20 resize-y px-4 py-3 leading-relaxed"
          />
          {error && (
            <p role="alert" className="auth-alert mt-4 rounded-xl px-4 py-3 text-[0.9375rem]">
              {error}
            </p>
          )}
          <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <button type="button" onClick={close} data-autofocus className="press inline-flex h-12 items-center justify-center rounded-xl px-5 text-[1rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2">
              Keep it
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="press inline-flex h-12 items-center justify-center rounded-xl bg-ink px-5 text-[1rem] font-semibold text-ground hover:opacity-90 disabled:opacity-70"
            >
              {busy ? "Cancelling…" : "Cancel request"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
