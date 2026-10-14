import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ProviderAccounts } from "@/features/admin/payments/components/payment-accounts";
import { fetchProviders } from "@/features/shared/payments/data";
import { requireStaff } from "@/features/admin/shell/session";

export const metadata: Metadata = { title: "Shop accounts · J&J Sportswear Admin" };

/** Owner: the shop's account at each e-wallet and bank, and which ones customers can pay through online. */
export default async function AccountsPage() {
  const { supabase, profile } = await requireStaff();
  if (profile.role !== "owner") notFound();
  const [{ providers, error }, { data: paths }] = await Promise.all([
    fetchProviders(supabase),
    supabase.from("payment_providers").select("code, qr_path"),
  ]);
  const qrPath = new Map(((paths ?? []) as { code: string; qr_path: string | null }[]).map((r) => [r.code, r.qr_path]));

  return (
    <div className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10">
      <Link href="/admin/payments" className="press inline-flex items-center gap-1.5 py-1 text-[0.9375rem] font-semibold text-ink hover:underline">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Payments
      </Link>
      <header className="mb-6 mt-4">
        <h1 className="voice-display text-[clamp(2.25rem,5vw,3.5rem)]">Shop accounts</h1>
        <p className="mt-2 max-w-[60ch] text-[0.9375rem] text-ink-2">
          Where customers send custom-order payments. A provider shows on the customer’s pay screen once it’s switched on, with the name and number they send to.
        </p>
      </header>
      {error ? (
        <p role="alert" className="auth-alert rounded-2xl px-5 py-4 text-[0.9375rem]">
          We couldn’t load the accounts just now. Refresh the page to try again.
        </p>
      ) : (
        <ProviderAccounts providers={providers.filter((p) => p.isActive).map((p) => ({ ...p, qrPath: qrPath.get(p.code) ?? null }))} />
      )}
    </div>
  );
}
