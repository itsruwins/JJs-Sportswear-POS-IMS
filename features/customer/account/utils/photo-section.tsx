'use client';

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AVATAR_SIZE } from "@/features/customer/account/validation";
import { uuid } from "@/lib/uuid";
import { createClient } from "@/lib/supabase/client";
import { removePhoto, setPhoto } from "@/features/customer/account/actions";
import { Avatar } from "@/features/customer/shell/components/avatar";
import { Camera, LoaderCircle } from "lucide-react";
import {sectionTitle, label, hint, errorText} from '../reusable/account-reusable';
import {Props} from '../types/personal-type'

/** Crops a picked photo to a centered square and shrinks it to 512px WebP. */
async function squarePhoto(file: File) {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error("That file isn’t a photo this browser can read. Try a JPG or PNG.");
    }
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.min(AVATAR_SIZE, side);
    canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.88));
    if (!blob) throw new Error("We couldn’t prepare that photo. Try another one.");
    return blob;
  }

export function PhotoSection({ uid, username, initials, fullName, avatarUrl }: Props) {
    const router = useRouter();
    const [url, setUrl] = useState(avatarUrl);
    const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
    const [error, setError] = useState("");
  
    const upload = async (file: File | undefined) => {
      if (!file) return;
      setBusy("upload");
      setError("");
      try {
        const blob = await squarePhoto(file);
        const path = `${uid}/${uuid()}.webp`;
        const up = await createClient().storage.from("avatars").upload(path, blob, { contentType: "image/webp" });
        if (up.error) throw new Error("The photo didn’t upload. Check your connection and try again.");
        const r = await setPhoto(path);
        if (!r.ok) throw new Error(r.message);
        setUrl(r.url);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "The photo didn’t upload. Try again.");
      } finally {
        setBusy(null);
      }
    };
  
    const remove = async () => {
      setBusy("remove");
      setError("");
      const r = await removePhoto();
      setBusy(null);
      if (!r.ok) return setError(r.message);
      setUrl(null);
      router.refresh();
    };
  
    return (
      <section aria-labelledby="photo-title">
        <h2 id="photo-title" className="sr-only">
          Profile photo
        </h2>
        <div className="flex items-center gap-4 sm:gap-5">
          <div className="relative shrink-0">
            <Avatar url={url} initials={initials} className="size-20 text-[1.5rem] sm:size-24 sm:text-[1.75rem]" />
            {busy === "upload" && (
              <span className="absolute inset-0 grid place-items-center rounded-full bg-ground/70" role="status">
                <LoaderCircle aria-hidden="true" className="size-6 animate-spin text-ink" />
                <span className="sr-only">Uploading your photo…</span>
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[1.25rem] font-semibold text-ink">{fullName || `@${username}`}</p>
            <p className="truncate text-[0.9375rem] text-ink-2">@{username}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="press inline-flex h-10 cursor-pointer items-center gap-2 rounded-full px-4 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2 focus-within:shadow-[0_0_0_2px_var(--focus)]">
                <Camera aria-hidden="true" className="size-[1.125rem] text-ink-2" />
                {url ? "Change photo" : "Add a photo"}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={busy !== null}
                  onChange={(e) => {
                    upload(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {url && (
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy !== null}
                  className="press inline-flex h-10 items-center rounded-full px-3 text-[0.9375rem] font-semibold text-ink-2 hover:bg-ground-2 hover:text-ink disabled:opacity-60"
                >
                  {busy === "remove" ? "Removing…" : "Remove"}
                </button>
              )}
            </div>
            {error ? (
              <p role="alert" className={errorText}>
                {error}
              </p>
            ) : (
              <p className={hint}>The shop sees your photo in messages and on your orders.</p>
            )}
          </div>
        </div>
      </section>
    );
  }