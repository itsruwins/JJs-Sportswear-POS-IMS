"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, LoaderCircle, Pencil, Trash2 } from "lucide-react";
import { deleteProduct, setProductArchived } from "@/features/admin/products/actions";

type Props = {
  id: string;
  name: string;
  archived: boolean;
  isOwner: boolean;
  canDelete: boolean;
  /** Rendered first, e.g. the Adjust stock button. */
  lead?: React.ReactNode;
};

const primary =
  "press inline-flex h-11 items-center gap-2 rounded-xl bg-board px-5 text-[0.9375rem] font-semibold text-board-ink hover:bg-board-deep";
const secondary =
  "press inline-flex h-11 items-center gap-2 rounded-xl px-4 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2 disabled:opacity-70";

/** Edit, archive or restore, and (owner only) delete. */
export function ProductActions({ id, name, archived, isOwner, canDelete, lead }: Props) {
  const router = useRouter();
  const confirmRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState<"archive" | "delete" | null>(null);
  const [message, setMessage] = useState("");

  const toggleArchive = async () => {
    setBusy("archive");
    setMessage("");
    const result = await setProductArchived(id, !archived);
    setBusy(null);
    if (!result.ok) setMessage(result.message);
    else router.refresh();
  };

  const remove = async () => {
    setBusy("delete");
    setMessage("");
    const result = await deleteProduct(id);
    setBusy(null);
    confirmRef.current?.close();
    if (!result.ok) setMessage(result.message);
    else {
      router.push("/admin/products?deleted=1");
      router.refresh();
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5">
        {lead}
        <Link href={`/admin/products/${id}/edit`} className={lead ? secondary : primary}>
          <Pencil aria-hidden="true" className="size-4" />
          Edit product
        </Link>
        <button type="button" onClick={toggleArchive} disabled={!!busy} className={secondary}>
          {busy === "archive" ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : archived ? (
            <ArchiveRestore aria-hidden="true" className="size-4" />
          ) : (
            <Archive aria-hidden="true" className="size-4" />
          )}
          {archived ? "Restore to catalog" : "Archive"}
        </button>
        {canDelete && (
          <button type="button" onClick={() => confirmRef.current?.showModal()} disabled={!!busy} className={secondary}>
            <Trash2 aria-hidden="true" className="size-4" />
            Delete
          </button>
        )}
      </div>
      {isOwner && !canDelete && (
        <p className="mt-2.5 text-[0.8125rem] text-ink-2">
          This product has stock history, so it can be archived but not deleted.
        </p>
      )}
      {message && (
        <p role="alert" className="auth-alert mt-3 max-w-[56ch] rounded-xl px-4 py-3 text-[0.9375rem]">
          {message}
        </p>
      )}

      {canDelete && (
        <dialog ref={confirmRef} className="auth-dialog" aria-labelledby="delete-title">
          <div className="auth-sheet px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-7 sm:pb-7">
            <h2 id="delete-title" className="voice-display text-[1.875rem]">
              Delete {name}?
            </h2>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-2">
              This removes the product, its photos, and its sizes and colors for good. It has never held stock, so no
              history is lost.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => confirmRef.current?.close()} className={secondary} autoFocus>
                Keep it
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={busy === "delete"}
                className="press inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-ink px-5 text-[0.9375rem] font-semibold text-ground hover:opacity-90 disabled:opacity-70"
              >
                {busy === "delete" && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
                Delete product
              </button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}
