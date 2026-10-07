import { LogOutButton } from "./log-out-button";
import { PageHeader, pageShell } from "./page-parts";

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid gap-1 py-3.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
      <dt className="voice-label text-[0.8125rem] text-ink-2">{label}</dt>
      <dd className={`break-words text-[0.9375rem] ${value ? "text-ink" : "text-ink-2"}`}>{value ?? "Not added"}</dd>
    </div>
  );
}

export function AccountView({
  fullName,
  username,
  phone,
  email,
  joined,
}: {
  fullName: string | null;
  username: string;
  phone: string | null;
  email: string | null;
  joined: string;
}) {
  return (
    <div className={pageShell}>
      <PageHeader title="Account" sub="The details the shop sees when you order or message them." />

      <section aria-labelledby="details-title" className="max-w-[40rem]">
        <h2 id="details-title" className="voice-display border-b border-line pb-3 text-[1.75rem]">
          Your details
        </h2>
        <dl className="divide-y divide-line">
          <Row label="Name" value={fullName} />
          <Row label="Username" value={`@${username}`} />
          <Row label="Phone" value={phone} />
          <Row label="Email" value={email} />
          <Row label="Member since" value={joined} />
        </dl>
        <p className="mt-2 border-t border-line pt-4 text-[0.875rem] text-ink-2">
          Editing your details and adding a profile photo come in a later update.
        </p>
        <LogOutButton className="mt-8" />
      </section>
    </div>
  );
}
