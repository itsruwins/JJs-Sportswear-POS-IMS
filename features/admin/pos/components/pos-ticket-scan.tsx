"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, LoaderCircle, X } from "lucide-react";
import { normalizeTicketCode } from "@/features/shared/tickets/model";

type Reader = typeof import("jsqr").default;
let reader: Promise<Reader> | null = null;
/** The QR reader loads the first time Scan is opened, so the counter's first paint carries none of it. */
const loadReader = () => (reader ??= import("jsqr").then((m) => m.default));

/** Reads a ticket code from a frame; anything that isn't one of the shop's codes is ignored. */
function readCode(read: Reader, ctx: CanvasRenderingContext2D, source: CanvasImageSource, w: number, h: number) {
  const scale = Math.min(1, 720 / Math.max(w, h));
  const cw = Math.round(w * scale);
  const ch = Math.round(h * scale);
  ctx.canvas.width = cw;
  ctx.canvas.height = ch;
  ctx.drawImage(source, 0, 0, cw, ch);
  const found = read(ctx.getImageData(0, 0, cw, ch).data, cw, ch, {
    inversionAttempts: "attemptBoth",
  });
  if (!found) return { code: null, other: false };
  const code = normalizeTicketCode(found.data);
  return { code, other: !code };
}

type Camera = "starting" | "live" | "denied" | "unavailable";

/**
 * Scan a customer's ticket: a live viewfinder that reads the QR on its own. Where the camera
 * can't open (no HTTPS, permission denied, no camera), a still photo does the same job.
 */
export function TicketScanSheet({ open, onClose, onCode }: { open: boolean; onClose: () => void; onCode: (code: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const photo = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState<Camera>("starting");
  const [hint, setHint] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // The viewfinder runs only while the sheet is open, and the camera light goes off with it.
  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let shown: HTMLVideoElement | null = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- each opening starts from a fresh camera state
    setCamera("starting");
    setHint(null);

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
        setCamera("unavailable");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch (e) {
        setCamera(e instanceof DOMException && e.name === "NotAllowedError" ? "denied" : "unavailable");
        return;
      }
      const v = video.current;
      if (stopped || !v) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      v.srcObject = stream;
      shown = v;
      await v.play().catch(() => {});
      setCamera("live");
      const read = await loadReader();
      const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      // About seven reads a second: quick to catch a code, light on a tablet's battery.
      const tick = () => {
        if (stopped) return;
        if (v.readyState >= 2 && v.videoWidth) {
          const { code, other } = readCode(read, ctx, v, v.videoWidth, v.videoHeight);
          if (code) {
            stopped = true;
            navigator.vibrate?.(30);
            onCode(code);
            return;
          }
          if (other) setHint("That QR isn’t a J&J ticket. Scan the code on the customer’s ticket page.");
        }
        timer = window.setTimeout(tick, 140);
      };
      tick();
    })();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      if (shown) shown.srcObject = null;
    };
    // onCode changes identity each render; the scan only restarts when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fromPhoto = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setHint(null);
    try {
      const [read, bitmap] = await Promise.all([loadReader(), createImageBitmap(file)]);
      const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      const { code, other } = ctx ? readCode(read, ctx, bitmap, bitmap.width, bitmap.height) : { code: null, other: false };
      bitmap.close();
      if (code) onCode(code);
      else setHint(other ? "That QR isn’t a J&J ticket." : "No ticket code in that photo. Fill the frame with the QR and try again.");
    } catch {
      setHint("That photo couldn’t be read. Try again.");
    } finally {
      setReading(false);
      if (photo.current) photo.current.value = "";
    }
  };

  const noCamera = camera === "denied" || camera === "unavailable";

  return (
    <dialog
      ref={dialog}
      className="auth-dialog"
      aria-labelledby="ticket-scan-title"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
    >
      <div className="auth-sheet px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-7 sm:pb-7">
        <div className="flex items-start justify-between gap-4">
          <h2 id="ticket-scan-title" className="voice-display text-[1.875rem]">
            Scan ticket
          </h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="press -mr-2 -mt-1 grid size-10 place-items-center rounded-full text-ink-2 hover:bg-ground-2 hover:text-ink"
          >
            <X aria-hidden="true" className="size-5" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        {!noCamera ? (
          <>
            <p className="mt-2 text-[0.9375rem] text-ink-2">Hold the customer’s ticket QR inside the frame. It reads on its own.</p>
            <div className="relative mt-5 aspect-square overflow-hidden rounded-[1.25rem] bg-board">
              <video ref={video} muted playsInline aria-label="Camera view" className="size-full object-cover" />
              <span aria-hidden="true" className="pos-scan-target" />
              {camera === "starting" && (
                <span className="absolute inset-0 grid place-items-center text-[0.9375rem] text-board-ink-2">
                  <LoaderCircle aria-hidden="true" className="size-6 animate-spin" />
                  <span className="sr-only">Starting the camera…</span>
                </span>
              )}
            </div>
          </>
        ) : (
          <p role="status" className="auth-alert mt-4 rounded-xl px-4 py-3 text-[0.9375rem]">
            {camera === "denied"
              ? "The camera is blocked for this site. Allow it in the browser’s settings, or take a photo of the QR instead."
              : "The live camera isn’t available here (it needs the secure https:// address). Take a photo of the QR instead."}
          </p>
        )}

        <p aria-live="polite" className="mt-3 min-h-[1.25rem] text-[0.875rem] font-semibold text-ink">
          {hint}
        </p>

        <label
          className={`press mt-3 inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-5 text-[1rem] font-semibold ${
            noCamera ? "bg-ink text-ground hover:opacity-90" : "text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2"
          }`}
        >
          {reading ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Camera aria-hidden="true" className="size-4" />}
          {reading ? "Reading the photo…" : noCamera ? "Take a photo of the QR" : "Take a photo instead"}
          <input
            ref={photo}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={reading}
            onChange={(e) => fromPhoto(e.target.files?.[0])}
          />
        </label>
      </div>
    </dialog>
  );
}
