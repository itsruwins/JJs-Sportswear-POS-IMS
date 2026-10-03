"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-fetches the page's server data when the tab comes back into view and every
 * minute while it's visible, so flip-card counts flip when the numbers move.
 * Swap for a Realtime subscription once product tables are in the publication.
 */
export function LiveRefresh({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(refresh, intervalMs);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, intervalMs]);
  return null;
}
