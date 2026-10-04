"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, Store } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { StaffRole } from "@/lib/admin/session";
import { Wordmark } from "@/components/landing/wordmark";
import { ThemeButton } from "@/components/theme-button";
import { ROLE_LABEL } from "./nav";
import { NotificationBell } from "./notification-bell";
import { usePopoverOpen } from "./use-popover-open";

type Props = { userId: string; username: string; fullName: string | null; role: StaffRole };

function initials(fullName: string | null, username: string) {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] ?? username[0] ?? "?").toUpperCase();
}

export function AdminTopBar({ userId, username, fullName, role }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuOpen = usePopoverOpen(menuRef);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const logOut = async () => {
    setSigningOut(true);
    await createClient().auth.signOut();
    router.replace("/");
    router.refresh();
  };

  return (
    <header className="site-nav sticky top-0" data-scrolled={scrolled}>
      <div className="mx-auto flex h-16 max-w-[80rem] items-center gap-3 px-4 sm:px-6 lg:px-10">
        <Link href="/admin" className="press -ml-1 flex items-center gap-3 rounded-lg px-1 py-1" aria-label="J&J Sportswear admin home">
          <Wordmark compact />
          <span aria-hidden="true" className="h-5 w-px bg-line" />
          <span aria-hidden="true" className="voice-label text-[0.9375rem] text-ink-2">
            Admin
          </span>
        </Link>

        <ThemeButton className="ml-auto" />
        <NotificationBell userId={userId} />
        <button
          type="button"
          popoverTarget="admin-account"
          aria-expanded={menuOpen}
          aria-controls="admin-account"
          className="press flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2.5 hover:bg-ground-2"
        >
          <span
            aria-hidden="true"
            className="voice-label grid size-9 place-items-center rounded-full bg-board text-[0.875rem] text-board-ink"
          >
            {initials(fullName, username)}
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-[0.9375rem] font-semibold text-ink">{fullName ?? `@${username}`}</span>
            <span className="block text-[0.8125rem] text-ink-2">{ROLE_LABEL[role]}</span>
          </span>
          <span className="sr-only">Account menu</span>
          <ChevronDown aria-hidden="true" className="size-4 text-ink-2" />
        </button>
      </div>

      <div id="admin-account" ref={menuRef} popover="auto" className="admin-pop admin-account" aria-label="Account">
        <div className="px-3 pb-3 pt-2">
          <p className="text-[1rem] font-semibold leading-tight text-ink">{fullName ?? username}</p>
          <p className="mt-0.5 text-[0.875rem] text-ink-2">@{username}</p>
          <span
            className={`mt-2.5 inline-block rounded-full px-2.5 py-0.5 text-[0.75rem] font-semibold ${
              role === "owner" ? "bg-board text-board-ink" : "bg-ground-2 text-ink shadow-[inset_0_0_0_1px_var(--line)]"
            }`}
          >
            {ROLE_LABEL[role]}
          </span>
        </div>
        <div className="border-t border-line pt-1.5">
          <Link
            href="/"
            className="press flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.9375rem] font-medium text-ink hover:bg-ground-2"
          >
            <Store aria-hidden="true" className="size-[1.125rem] text-ink-2" />
            View the shop
          </Link>
          <button
            type="button"
            onClick={logOut}
            disabled={signingOut}
            className="press flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[0.9375rem] font-medium text-ink hover:bg-ground-2 disabled:opacity-70"
          >
            <LogOut aria-hidden="true" className="size-[1.125rem] text-ink-2" />
            {signingOut ? "Logging out…" : "Log out"}
          </button>
        </div>
      </div>
    </header>
  );
}
