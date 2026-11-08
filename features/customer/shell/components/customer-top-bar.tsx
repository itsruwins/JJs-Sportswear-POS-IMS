"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, CircleUserRound, House, LogOut } from "lucide-react";
import { NotificationBell } from "@/features/shared/ui/notification-bell";
import { usePopoverOpen } from "@/features/shared/ui/use-popover-open";
import { Wordmark } from "@/features/shared/ui/wordmark";
import { ThemeButton } from "@/features/shared/ui/theme-button";
import { CUSTOMER_HOME, CUSTOMER_TABS, isActiveTab } from "@/features/customer/shell/nav";
import { CartButton } from "@/features/customer/cart/components/cart-button";
import { Avatar } from "./avatar";
import { useLogOut } from "./log-out-button";

type Props = {
  userId: string;
  username: string;
  fullName: string | null;
  initials: string;
  avatarUrl: string | null;
  /** Pieces in the cart, for the bag. */
  cartCount: number;
  activeHref?: string;
};

const menuItem =
  "press flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[0.9375rem] font-medium text-ink hover:bg-ground-2";

export function CustomerTopBar({ userId, username, fullName, initials, avatarUrl, cartCount, activeHref }: Props) {
  const current = usePathname();
  const pathname = activeHref ?? current;
  const [scrolled, setScrolled] = useState(false);
  const { signingOut, logOut } = useLogOut();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuOpen = usePopoverOpen(menuRef);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="site-nav sticky top-0" data-scrolled={scrolled}>
      <div className="mx-auto flex h-16 max-w-[80rem] items-center gap-3 px-4 sm:px-6 lg:px-10">
        <Link href={CUSTOMER_HOME} className="press -ml-1 rounded-lg px-1 py-1" aria-label="J&J Sportswear shop">
          <Wordmark compact />
        </Link>

        {/* Desktop: the dock's tabs move up here. Account sits in the avatar menu. */}
        <nav aria-label="Sections" className="ml-6 hidden lg:block">
          <ul className="flex items-center gap-1">
            {CUSTOMER_TABS.filter((t) => t.desktop).map((t) => (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={isActiveTab(t.href, pathname) ? "page" : undefined}
                  className="customer-tab press"
                >
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <CartButton count={cartCount} current={isActiveTab("/cart", pathname)} />
          <NotificationBell userId={userId} variant="customer" />
          <ThemeButton />
        </div>

        <button
          type="button"
          popoverTarget="customer-account"
          aria-expanded={menuOpen}
          aria-controls="customer-account"
          data-current={isActiveTab("/account", pathname) ? "true" : undefined}
          className="customer-avatar press hidden items-center gap-2.5 rounded-full py-1 pl-1 pr-2.5 hover:bg-ground-2 lg:flex"
        >
          <Avatar url={avatarUrl} initials={initials} />
          <span className="text-left leading-tight">
            <span className="block max-w-[12rem] truncate text-[0.9375rem] font-semibold text-ink">{fullName ?? `@${username}`}</span>
            <span className="block max-w-[12rem] truncate text-[0.8125rem] text-ink-2">@{username}</span>
          </span>
          <span className="sr-only">Account menu</span>
          <ChevronDown aria-hidden="true" className="size-4 text-ink-2" />
        </button>
      </div>

      <div id="customer-account" ref={menuRef} popover="auto" className="admin-pop admin-account" aria-label="Account">
        <div className="px-3 pb-3 pt-2">
          <p className="truncate text-[1rem] font-semibold leading-tight text-ink">{fullName ?? username}</p>
          <p className="mt-0.5 truncate text-[0.875rem] text-ink-2">@{username}</p>
        </div>
        <div className="border-t border-line pt-1.5">
          <Link href="/account" onClick={() => menuRef.current?.hidePopover()} className={menuItem}>
            <CircleUserRound aria-hidden="true" className="size-[1.125rem] text-ink-2" />
            Your account
          </Link>
          <Link href="/" className={menuItem}>
            <House aria-hidden="true" className="size-[1.125rem] text-ink-2" />
            J&amp;J Sportswear home
          </Link>
          <button type="button" onClick={logOut} disabled={signingOut} className={`${menuItem} disabled:opacity-70`}>
            <LogOut aria-hidden="true" className="size-[1.125rem] text-ink-2" />
            {signingOut ? "Logging out…" : "Log out"}
          </button>
        </div>
      </div>
    </header>
  );
}
