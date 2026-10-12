import type { SupabaseClient } from "@supabase/supabase-js";
import { GCASH_ONLY, type PaymentProvider, type ProviderKind } from "@/features/shared/payments/model";

export const PROVIDERS_MIGRATION = "supabase/migrations/20261016120000_e_payments.sql";

type Row = {
  code: string;
  name: string;
  kind: ProviderKind;
  reference_pattern: string;
  reference_hint: string;
  is_active: boolean;
};

/**
 * Every provider, in the shop's order (switched-off ones too, so old sales keep their names).
 * Before the e-payment update has run, GCash alone comes back, the way it worked then,
 * with `outdated` set.
 */
export async function fetchProviders(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("payment_providers")
    .select("code, name, kind, reference_pattern, reference_hint, is_active")
    .order("sort_order")
    .order("name");
  if (error?.code === "PGRST205" || error?.code === "42P01") return { providers: GCASH_ONLY, outdated: true, error: null };
  if (error) return { providers: [] as PaymentProvider[], outdated: false, error };
  const providers = ((data ?? []) as Row[]).map(
    (r): PaymentProvider => ({ code: r.code, name: r.name, kind: r.kind, pattern: r.reference_pattern, hint: r.reference_hint, isActive: r.is_active }),
  );
  return { providers, outdated: false, error: null };
}
