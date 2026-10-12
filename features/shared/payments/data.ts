import type { SupabaseClient } from "@supabase/supabase-js";
import { GCASH_ONLY, type PaymentProvider, type ProviderKind } from "@/features/shared/payments/model";

export const PROVIDERS_MIGRATION = "supabase/migrations/20261016120000_e_payments.sql";
/** Where the shop's QR codes live (public). */
export const ACCOUNTS_BUCKET = "shop-accounts";

type Row = {
  code: string;
  name: string;
  kind: ProviderKind;
  reference_pattern: string;
  reference_hint: string;
  is_active: boolean;
  accepts_online?: boolean;
  account_name?: string | null;
  account_number?: string | null;
  qr_path?: string | null;
};

const BASE = "code, name, kind, reference_pattern, reference_hint, is_active";
const ONLINE = `${BASE}, accepts_online, account_name, account_number, qr_path`;

/**
 * Every provider, in the shop's order (switched-off ones too, so old payments keep their names).
 * Before the e-payment update has run, GCash alone comes back, the way it worked then, with
 * `outdated` set. Before the online-payments update (20261019000000), only GCash takes payments online.
 */
export async function fetchProviders(supabase: SupabaseClient) {
  const run = (online: boolean) => supabase.from("payment_providers").select(online ? ONLINE : BASE).order("sort_order").order("name");
  let res = await run(true);
  if (res.error?.code === "42703") res = await run(false);
  const { data, error } = res;
  if (error?.code === "PGRST205" || error?.code === "42P01") return { providers: GCASH_ONLY, outdated: true, error: null };
  if (error) return { providers: [] as PaymentProvider[], outdated: false, error };
  const publicUrl = (path: string) => supabase.storage.from(ACCOUNTS_BUCKET).getPublicUrl(path).data.publicUrl;
  const providers = ((data ?? []) as unknown as Row[]).map(
    (r): PaymentProvider => ({
      code: r.code,
      name: r.name,
      kind: r.kind,
      pattern: r.reference_pattern,
      hint: r.reference_hint,
      isActive: r.is_active,
      acceptsOnline: r.accepts_online ?? r.code === "gcash",
      accountName: r.account_name ?? null,
      accountNumber: r.account_number ?? null,
      qrUrl: r.qr_path ? publicUrl(r.qr_path) : null,
    }),
  );
  return { providers, outdated: false, error: null };
}
