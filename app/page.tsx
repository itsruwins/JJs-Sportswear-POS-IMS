import Link from "next/link";
import { AuthButton, AuthProvider } from "@/components/auth/auth-provider";
import { AiStudio } from "@/components/landing/ai-studio";
import { OrderBand } from "@/components/landing/order-band";
import { Scoreboard } from "@/components/landing/scoreboard";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteNav } from "@/components/landing/site-nav";
import { StaffBoxScore } from "@/components/landing/staff-box-score";
import { StockStandings } from "@/components/landing/stock-standings";
import { UsernameForm } from "@/components/landing/username-form";

const shell = "mx-auto w-full max-w-[80rem] px-4 sm:px-6 lg:px-10";

export default function Home() {
  return (
    <AuthProvider>
      <a
        href="#main"
        className="sr-only fixed left-4 top-3 z-[var(--z-skip)] rounded-lg bg-ink px-4 py-2 text-ground focus:not-sr-only"
      >
        Skip to content
      </a>
      <SiteNav />

      <main id="main" className="flex-1">
        {/* Hero: the scoreboard */}
        <section aria-labelledby="hero-title" className={`${shell} pb-20 pt-8 sm:pt-12 lg:pb-28 lg:pt-14`}>
          <div className="mb-7 flex flex-col gap-4 lg:mb-9 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
            <h1
              id="hero-title"
              className="voice-display min-w-0 flex-1 text-[clamp(2.75rem,7.4vw,5.75rem)] text-ink"
            >
              <span className="whitespace-nowrap">Design it.</span>{" "}
              <span className="whitespace-nowrap">Track it.</span>{" "}
              <span className="whitespace-nowrap text-board-text">Wear it.</span>
            </h1>
            <p className="max-w-[36ch] shrink-0 text-[1.0625rem] leading-relaxed text-ink-2 lg:mb-2">
              Custom team kits from J&amp;J Sportswear in Legazpi, with every order on a board you can check from your
              phone, from first draft to pickup.
            </p>
          </div>
          <Scoreboard />
        </section>

        {/* How custom orders work */}
        <section id="orders" aria-labelledby="orders-title" className="border-t border-line py-20 lg:py-28">
          <div className={shell}>
            <div className="mb-14 grid gap-5 lg:mb-16 lg:grid-cols-2 lg:items-end lg:gap-16">
              <h2 id="orders-title" className="voice-display text-[clamp(2.5rem,5.5vw,4.25rem)]">
                From first sketch to pickup day.
              </h2>
              <p className="max-w-[52ch] text-[1.0625rem] leading-relaxed text-ink-2">
                The same steps the shop has always followed, now on record. Each change is stamped the moment it
                happens, and you get a notification when your order moves.
              </p>
            </div>
            <OrderBand />
          </div>
        </section>

        {/* AI studio */}
        <section id="studio" aria-labelledby="studio-title" className="bg-ground-2 py-20 lg:py-28">
          <div className={shell}>
            <h2 id="studio-title" className="voice-display mb-12 max-w-[16ch] text-[clamp(2.5rem,5.5vw,4.25rem)] lg:mb-14">
              Say it in words. See it on a jersey.
            </h2>
            <AiStudio />
          </div>
        </section>

        {/* Sizes and stock */}
        <section id="stock" aria-labelledby="stock-title" className="py-20 lg:py-28">
          <div className={shell}>
            <div className="mb-12 grid gap-5 lg:grid-cols-2 lg:items-end lg:gap-16">
              <h2 id="stock-title" className="voice-display text-[clamp(2.5rem,5.5vw,4.25rem)]">
                Check your size before you ride over.
              </h2>
              <div className="flex flex-col items-start gap-4">
                <p className="max-w-[48ch] text-[1.0625rem] leading-relaxed text-ink-2">
                  Every product shows its sizes, colors, and what’s left on the rack, updated as the counter sells. No
                  more messaging the shop to ask.
                </p>
                <Link
                  href="/shop"
                  className="press inline-flex h-11 items-center rounded-full bg-ink px-5 text-[0.9375rem] font-semibold text-ground hover:opacity-90"
                >
                  Browse the shop
                </Link>
              </div>
            </div>
            <StockStandings />
          </div>
        </section>

        {/* For staff: drenched in board green */}
        <section id="staff" aria-labelledby="staff-title" className="bg-board py-20 text-board-ink lg:py-28">
          <div className={shell}>
            <StaffBoxScore />
          </div>
        </section>

        {/* Close */}
        <section aria-labelledby="close-title" className="py-24 lg:py-32">
          <div className={`${shell} grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-end lg:gap-16`}>
            <h2 id="close-title" className="voice-display text-[clamp(2.75rem,6.5vw,5rem)]">
              Your team’s next kit starts with a username.
            </h2>
            <div>
              <UsernameForm />
              <p className="mt-5 text-[0.9375rem] text-ink-2">
                Already have an account?{" "}
                <AuthButton mode="login" className="font-semibold text-ink underline">
                  Log in
                </AuthButton>
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </AuthProvider>
  );
}
