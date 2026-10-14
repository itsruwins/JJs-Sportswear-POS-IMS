import Link from "next/link";
import { AuthButton } from "@/features/shared/auth/components/auth-provider";
import { Wordmark } from "@/features/shared/ui/wordmark";

// Shop details are placeholders until the owner confirms them.
const SHOP_DETAILS = [
  { label: "Visit", value: "Street address to follow, Legazpi City, Albay" },
  { label: "Hours", value: "Shop hours to follow" },
  { label: "Call", value: "Phone number to follow" },
  { label: "Message", value: "Facebook page to follow" },
];

const LINKS = [
  { href: "/shop", label: "Shop" },
  { href: "#orders", label: "Custom orders" },
  { href: "#studio", label: "AI studio" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[80rem] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1fr_auto] lg:px-10">
        <div>
          <Wordmark />
          <dl className="mt-6 grid gap-x-10 gap-y-3 text-[0.9375rem] sm:grid-cols-2">
            {SHOP_DETAILS.map((d) => (
              <div key={d.label} className="flex gap-3">
                <dt className="w-[4.5rem] shrink-0 font-semibold text-ink">{d.label}</dt>
                <dd className="italic text-ink-2">{d.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <nav aria-label="Footer">
          <ul className="grid grid-cols-2 gap-x-8 gap-y-2.5 text-[0.9375rem] md:grid-cols-1 md:text-right">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-ink-2 transition-colors hover:text-ink hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <AuthButton mode="login" className="text-ink-2 transition-colors hover:text-ink hover:underline">
                Log in
              </AuthButton>
            </li>
            <li>
              <AuthButton mode="signup" className="text-ink-2 transition-colors hover:text-ink hover:underline">
                Create account
              </AuthButton>
            </li>
          </ul>
        </nav>
      </div>
      <div className="mx-auto max-w-[80rem] px-4 pb-10 text-[0.8125rem] text-ink-2 sm:px-6 lg:px-10">
        © 2026 J&amp;J Sportswear. Orders, products, and stock shown on this page are samples.
      </div>
    </footer>
  );
}
