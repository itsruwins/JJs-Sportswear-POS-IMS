import type { Metadata } from "next";
import { CustomerDock } from "@/components/customer/customer-dock";
import { CustomerTopBar } from "@/components/customer/customer-top-bar";
import { initials, requireCustomer } from "@/lib/customer/session";

export const metadata: Metadata = {
  title: "J&J Sportswear",
  robots: { index: false, follow: false },
};

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireCustomer();

  return (
    <>
      <a
        href="#main"
        className="sr-only fixed left-4 top-3 z-[var(--z-skip)] rounded-lg bg-ink px-4 py-2 text-ground focus:not-sr-only"
      >
        Skip to content
      </a>
      <CustomerTopBar
        username={profile.username}
        fullName={profile.full_name}
        initials={initials(profile.full_name, profile.username)}
      />
      {/* Room for the dock on phones and tablets; desktop has no dock. */}
      <main id="main" className="flex-1 pb-36 sm:pb-40 lg:pb-20">
        {children}
      </main>
      <CustomerDock />
    </>
  );
}
