"use client";

import { useRef } from "react";
import Image from "next/image";
import { ImagePlus, Star, X } from "lucide-react";
import { LIMITS } from "@/features/admin/products/validation";

export type PhotoItem = {
  key: string;
  /** Saved photo id; absent until the product is saved. */
  id?: string;
  /** Public URL once uploaded, or a local preview URL before that. */
  url: string;
  /** Present until the file has been uploaded. */
  file?: File;
  is_primary: boolean;
};

type Props = {
  photos: PhotoItem[];
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
  onMakeMain: (key: string) => void;
  error?: string;
  errorId: string;
};

export function PhotoPicker({ photos, onAdd, onRemove, onMakeMain, error, errorId }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const room = LIMITS.images - photos.length;

  return (
    <div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {photos.map((p) => (
          <li key={p.key} className="relative">
            <div
              className={`relative aspect-square overflow-hidden rounded-2xl bg-[var(--photo-bg)] ${
                p.is_primary ? "shadow-[0_0_0_2px_var(--ink)]" : "shadow-[inset_0_0_0_1px_var(--line)]"
              }`}
            >
              <Image src={p.url} alt="" fill unoptimized sizes="12rem" className="object-contain p-[8%]" />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              {p.is_primary ? (
                <span className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-ink">
                  <Star aria-hidden="true" className="size-3.5 fill-current" />
                  Main photo
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onMakeMain(p.key)}
                  className="press rounded-full text-[0.8125rem] font-semibold text-ink-2 underline-offset-2 hover:text-ink hover:underline"
                >
                  Make main
                </button>
              )}
              <button
                type="button"
                onClick={() => onRemove(p.key)}
                aria-label={p.is_primary ? "Remove main photo" : "Remove photo"}
                className="press grid size-8 place-items-center rounded-full text-ink-2 shadow-[inset_0_0_0_1px_var(--line)] hover:text-ink"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
          </li>
        ))}
        {room > 0 && (
          <li>
            <button
              type="button"
              onClick={() => input.current?.click()}
              aria-describedby={errorId}
              className="press grid aspect-square w-full place-items-center rounded-2xl text-ink-2 shadow-[inset_0_0_0_1.5px_var(--line)] hover:bg-ground-2 hover:text-ink"
            >
              <span className="flex flex-col items-center gap-2 text-[0.875rem] font-semibold">
                <ImagePlus aria-hidden="true" className="size-6" strokeWidth={1.7} />
                Add photos
                <span className="text-[0.75rem] font-medium">{room} left</span>
              </span>
            </button>
          </li>
        )}
      </ul>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []).slice(0, room);
          if (files.length) onAdd(files);
          e.target.value = "";
        }}
      />
      <p id={errorId} className={`mt-3 text-[0.875rem] ${error ? "font-semibold text-ink" : "text-ink-2"}`}>
        {error ?? `Up to ${LIMITS.images} photos. The main photo shows in lists and the shop. Large photos are resized automatically.`}
      </p>
    </div>
  );
}
