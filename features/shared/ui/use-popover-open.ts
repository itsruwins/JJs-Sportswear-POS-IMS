"use client";

import { useEffect, useState, type RefObject } from "react";

/** Mirrors a native popover's open state, so its trigger can expose aria-expanded. */
export function usePopoverOpen(ref: RefObject<HTMLElement | null>) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onToggle = (e: Event) => setOpen((e as ToggleEvent).newState === "open");
    el.addEventListener("toggle", onToggle);
    return () => el.removeEventListener("toggle", onToggle);
  }, [ref]);
  return open;
}
