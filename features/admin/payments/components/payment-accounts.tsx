"use client";

import { uuid } from "@/lib/uuid";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ImagePlus, LoaderCircle } from "lucide-react";
import { prepareForUpload } from "@/features/shared/photos/prepare-upload";
import type { PaymentProvider } from "@/features/shared/payments/model";
import { createClient } from "@/lib/supabase/client";
import { updateProviderAccount } from "@/features/admin/payments/actions";

/**
 * Owner: the shop's account at each provider (what customers send custom-order payments to), and
 * a switch for whether customers can pay through it online. A provider needs its name and number
 * before it can be switched on.
 */
export function ProviderAccounts({ providers }: { providers: (PaymentProvider & { qrPath: string | null })[] }) {
  return (
    <ul className="border-t border-line">
      {providers.map((p) => (
        <AccountRow key={p.code} provider={p} />
      ))}
    </ul>
  );
}

function AccountRow({ provider: p }: { provider: PaymentProvider & { qrPath: string | null } }) {
  const router = useRouter();
  const ids = { online: useId(), name: useId(), number: useId() };
  const [online, setOnline] = useState(p.acceptsOnline);
  const [name, setName] = useState(p.accountName ?? "");
  const [number, setNumber] = useState(p.accountNumber ?? "");
  const [qr, setQr] = useState<{ path: string | null; url: string | null }>({ path: p.qrPath, url: p.qrUrl });
  const [busy, setBusy] = useState<"save" | "qr" | null>(null);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = online !== p.acceptsOnline || name !== (p.accountName ?? "") || number !== (p.accountNumber ?? "") || qr.path !== p.qrPath;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy("qr");
    setSaid(null);
    try {
      const { blob, ext, type } = await prepareForUpload(file);
      const path = `${p.code}/${uuid()}.${ext}`;
      const supabase = createClient();
      const { error } = await supabase.storage.from("shop-accounts").upload(path, blob, { contentType: type });
      if (error) throw new Error("The QR image didn’t upload. Try again.");
      setQr({ path, url: supabase.storage.from("shop-accounts").getPublicUrl(path).data.publicUrl });
    } catch (e) {
      setSaid({ ok: false, text: e instanceof Error ? e.message : "That image couldn’t be read. Use a PNG or JPG." });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (busy) return;
    setBusy("save");
    setSaid(null);
    try {
      const r = await updateProviderAccount(p.code, { acceptsOnline: online, accountName: name, accountNumber: number, qrPath: qr.path });
      setSaid({ ok: r.ok, text: r.ok ? "Saved" : r.message });
      if (r.ok) router.refresh();
    } catch {
      setSaid({ ok: false, text: "We couldn’t reach the server. Try again." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="grid gap-4 border-b border-line py-5 lg:grid-cols-[15rem_minmax(0,1fr)_auto] lg:items-start lg:gap-8">
      <div className="flex items-center justify-between gap-4 lg:block">
        <p className="text-[1.0625rem] font-semibold text-ink">{p.name}</p>
        <label htmlFor={ids.online} className="flex cursor-pointer items-center gap-2.5 whitespace-nowrap text-[0.875rem] text-ink lg:mt-2">
          <input id={ids.online} type="checkbox" role="switch" checked={online} onChange={(e) => setOnline(e.target.checked)} className="account-switch" />
          Customers can pay online
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={ids.name} className="text-[0.8125rem] font-semibold text-ink">
            Account name
          </label>
          <input id={ids.name} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="As customers will see it" className="auth-input mt-1 px-3.5 text-[1rem]" />
        </div>
        <div>
          <label htmlFor={ids.number} className="text-[0.8125rem] font-semibold text-ink">
            {p.kind === "bank" ? "Account number" : "Mobile number"}
          </label>
          <input
            id={ids.number}
            value={number}
            maxLength={40}
            inputMode={p.kind === "bank" ? "numeric" : "tel"}
            onChange={(e) => setNumber(e.target.value)}
            className="auth-input tabular mt-1 px-3.5 text-[1rem]"
          />
        </div>
        <div className="flex items-center gap-3 sm:col-span-2">
          {qr.url && (
            // eslint-disable-next-line @next/next/no-img-element -- a public QR image the owner just chose
            <img src={qr.url} alt={`${p.name} QR code`} className="size-16 rounded-lg bg-white object-contain p-1 shadow-[inset_0_0_0_1px_var(--line)]" />
          )}
          <label className="press inline-flex h-10 cursor-pointer items-center gap-2 rounded-full px-3.5 text-[0.875rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2 focus-within:shadow-[0_0_0_2px_var(--amber)]">
            {busy === "qr" ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <ImagePlus aria-hidden="true" className="size-4" />}
            {qr.url ? "Change QR code" : "Add QR code"}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={!!busy} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {qr.url && (
            <button type="button" onClick={() => setQr({ path: null, url: null })} className="press h-10 rounded-full px-2 text-[0.875rem] font-semibold text-ink-2 hover:text-ink">
              Remove
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 lg:flex-col lg:items-end">
        <button
          type="button"
          onClick={save}
          disabled={!changed || !!busy}
          className="press inline-flex h-11 items-center gap-2 rounded-xl bg-board px-5 text-[0.9375rem] font-semibold text-board-ink hover:bg-board-deep disabled:bg-ground-2 disabled:text-ink-2 disabled:shadow-[inset_0_0_0_1px_var(--line)]"
        >
          {busy === "save" && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
          Save
        </button>
        <p role="status" className={`text-[0.8125rem] ${said?.ok ? "inline-flex items-center gap-1 font-semibold text-ink" : "font-semibold text-ink"}`}>
          {said?.ok && <Check aria-hidden="true" className="size-3.5" />}
          {said?.text}
        </p>
      </div>
    </li>
  );
}
