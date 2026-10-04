"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LIVE_TABLES = ["products", "product_variants", "inventory_transactions"] as const;

/**
 * Re-fetches the page's server data when stock changes anywhere (Supabase Realtime on
 * products, variants, and the stock log), so flip-card counts flip as numbers move.
 * Falls back to a refresh on tab focus and every minute, which also covers databases
 * where the realtime migration (supabase/migrations/20261005000000_realtime_stock.sql)
 * hasn't been run yet.
 */
export function LiveRefresh({ intervalMs = 60_000, tables = LIVE_TABLES }: { intervalMs?: number; tables?: readonly string[] }) {
  const router = useRouter();
  // The table list as a value, so a new array with the same tables doesn't resubscribe.
  const watched = tables.join(",");

  useEffect(() => {
    let timer: number | undefined;
    // Several changes arrive together (a multi-size restock); refresh once for the burst.
    const refreshSoon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (document.visibilityState === "visible") router.refresh();
      }, 400);
    };

    const supabase = createClient();
    // A fresh topic per mount: reusing one while the previous page's copy is still leaving hands back a dead channel.
    const channel = supabase.channel(`admin-live-stock-${Math.random().toString(36).slice(2)}`);
    for (const table of watched.split(",")) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, refreshSoon);
    }
    channel.subscribe();

    const onVisible = () => document.visibilityState === "visible" && router.refresh();
    const poll = window.setInterval(onVisible, intervalMs);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [router, intervalMs, watched]);

  return null;
}
