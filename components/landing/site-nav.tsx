"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { Wordmark } from "./wordmark";

const LINKS = [
  { href: "#orders", label: "Custom orders" },
  { href: "#studio", label: "AI studio" },
  { href: "#stock", label: "Sizes & stock" },
  { href: "#staff", label: "For staff" },
];

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const { openAuth, username, signOut } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="site-nav sticky top-0" data-scrolled={scrolled}>
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-[80rem] items-center gap-6 px-4 sm:px-6 lg:px-10">
        <Link href="/" className="press -ml-1 rounded-lg px-1 py-1" aria-label="J&J Sportswear home">
          <Wordmark compact />
        </Link>

        <ul className="ml-4 hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="rounded-full px-3 py-2 text-[0.9375rem] text-ink-2 transition-colors duration-150 hover:text-ink"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {username ? (
            <>
              <button
                type="button"
                onClick={() => openAuth("login")}
                aria-haspopup="dialog"
                className="press max-w-[11rem] truncate rounded-full px-3 py-2 text-[0.9375rem] font-semibold text-ink hover:bg-ground-2"
              >
                @{username}
              </button>
              <button
                type="button"
                onClick={signOut}
                className="press whitespace-nowrap rounded-full px-3 py-2 text-[0.9375rem] font-medium text-ink-2 shadow-[inset_0_0_0_1px_var(--line)] hover:text-ink"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => openAuth("login")}
                aria-haspopup="dialog"
                className="press whitespace-nowrap rounded-full px-3 py-2 text-[0.9375rem] font-medium text-ink hover:bg-ground-2"
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => openAuth("signup")}
                aria-haspopup="dialog"
                className="press whitespace-nowrap rounded-full bg-board px-4 py-2 text-[0.9375rem] font-semibold text-board-ink hover:bg-board-deep"
              >
                Create account
              </button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
