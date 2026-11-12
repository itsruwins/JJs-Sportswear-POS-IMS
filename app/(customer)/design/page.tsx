import type { Metadata } from "next";
import { Studio, TriesLeft } from "@/features/customer/design/components/studio";
import { pageShell } from "@/features/customer/shell/components/page-parts";
import { DESIGNS_PER_DAY } from "@/features/customer/design/model";
import { fetchMyDesigns, STUDIO_MIGRATION } from "@/features/customer/design/data";
import { fluxConfigured } from "@/features/customer/design/flux";
import { requireCustomer } from "@/features/customer/shell/session";

export const metadata: Metadata = { title: "Design" };
// A FLUX generation can take half a minute; give the studio's server actions room.
export const maxDuration = 120;

export default async function DesignPage() {
  const { supabase, profile } = await requireCustomer();
  const { designs, usedToday, migrated, error } = await fetchMyDesigns(supabase);
  const live = fluxConfigured();
  // The picks come back from the last design, logo included; sign it so it shows.
  const logoPath = designs[0]?.details?.logoPath;
  const logoUrl = logoPath ? ((await supabase.storage.from("ai-designs").createSignedUrl(logoPath, 6 * 60 * 60)).data?.signedUrl ?? null) : null;

  return (
    <div className={pageShell}>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-5 sm:mb-8">
        <div>
          <h1 className="voice-display text-[clamp(2.25rem,5vw,3.5rem)]">Design</h1>
          <p className="mt-3 max-w-[48ch] text-[1.0625rem] leading-relaxed text-ink-2">
            Describe your team’s jersey and see it drawn, front and back. Like one? Send it to the shop as a custom order.
          </p>
        </div>
        <TriesLeft left={Math.max(0, DESIGNS_PER_DAY - usedToday)} />
      </header>

      {!live && (
        <p className="mb-6 rounded-2xl bg-ground-2 px-5 py-3.5 text-[0.9375rem] leading-relaxed text-ink shadow-[inset_0_0_0_1px_var(--line)]">
          <span className="font-semibold">Coming soon.</span> The shop is still turning the AI designer on. You can set up your picks now; generating opens once it’s on.
        </p>
      )}
      {!migrated && (
        <p role="status" className="auth-alert mb-6 rounded-2xl px-5 py-4 text-[0.9375rem]">
          The studio needs the shop’s latest database update ({STUDIO_MIGRATION}) to keep your picks and enforce the daily limit.
        </p>
      )}
      {error && (
        <p role="alert" className="auth-alert mb-6 rounded-2xl px-5 py-4 text-[0.9375rem]">
          We couldn’t load your designs just now. Refresh the page to try again.
        </p>
      )}

      <Studio uid={profile.id} designs={designs} usedToday={usedToday} live={live} savedLogoUrl={logoUrl} />
    </div>
  );
}
