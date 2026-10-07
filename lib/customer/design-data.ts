import type { SupabaseClient } from "@supabase/supabase-js";
import type { DesignPicks } from "./design-studio";

/** The file to run in Supabase for studio details, refinements, previews, and the daily limit. */
export const STUDIO_MIGRATION = "supabase/migrations/20261014000000_ai_design_studio.sql";

/** Design links last a working day, so an open studio keeps showing them. */
const SIGNED_FOR = 6 * 60 * 60;

const missingColumn = (e: { code?: string } | null) => e?.code === "42703" || e?.code === "PGRST204";

export const manilaDay = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(d);

export type MyDesign = {
  id: string;
  prompt: string;
  /** Signed link to the image in the private ai-designs bucket. */
  url: string | null;
  path: string | null;
  details: Partial<DesignPicks> | null;
  parentId: string | null;
  isPreview: boolean;
  attemptDate: string;
  createdAt: string;
};

type Row = {
  id: string;
  prompt: string;
  generated_image_url: string | null;
  attempt_date: string;
  created_at: string;
  details?: Partial<DesignPicks> | null;
  parent_id?: string | null;
  is_preview?: boolean | null;
};

/** Signs ai-designs paths in one call; full links (older rows) pass through. */
async function sign(supabase: SupabaseClient, rows: Row[]) {
  const paths = rows.map((r) => r.generated_image_url).filter((p): p is string => Boolean(p && !/^https?:\/\//.test(p)));
  const signed = paths.length ? await supabase.storage.from("ai-designs").createSignedUrls(paths, SIGNED_FOR) : null;
  const urlFor = new Map((signed?.data ?? []).map((s) => [s.path, s.signedUrl]));
  return (r: Row): MyDesign => ({
    id: r.id,
    prompt: r.prompt,
    path: r.generated_image_url && !/^https?:\/\//.test(r.generated_image_url) ? r.generated_image_url : null,
    url: r.generated_image_url ? (/^https?:\/\//.test(r.generated_image_url) ? r.generated_image_url : urlFor.get(r.generated_image_url) ?? null) : null,
    details: r.details ?? null,
    parentId: r.parent_id ?? null,
    isPreview: Boolean(r.is_preview),
    attemptDate: r.attempt_date,
    createdAt: r.created_at,
  });
}

/** The signed-in customer's designs, newest first, and how many they've made today. */
export async function fetchMyDesigns(supabase: SupabaseClient) {
  const run = (full: boolean) =>
    supabase
      .from("ai_designs")
      .select(`id, prompt, generated_image_url, attempt_date, created_at${full ? ", details, parent_id, is_preview" : ""}`)
      .order("created_at", { ascending: false })
      .limit(60);
  let res = await run(true);
  const migrated = !missingColumn(res.error);
  if (!migrated) res = await run(false);
  const rows = (res.data ?? []) as unknown as Row[];
  const toDesign = await sign(supabase, rows);
  const today = manilaDay();
  return {
    designs: rows.map(toDesign),
    usedToday: rows.filter((r) => r.attempt_date === today).length,
    migrated,
    error: Boolean(res.error && !missingColumn(res.error)),
  };
}

export async function fetchMyDesign(supabase: SupabaseClient, id: string): Promise<MyDesign | null> {
  const run = (full: boolean) =>
    supabase
      .from("ai_designs")
      .select(`id, prompt, generated_image_url, attempt_date, created_at${full ? ", details, parent_id, is_preview" : ""}`)
      .eq("id", id)
      .maybeSingle();
  let res = await run(true);
  if (missingColumn(res.error)) res = await run(false);
  if (!res.data) return null;
  const row = res.data as unknown as Row;
  return (await sign(supabase, [row]))(row);
}
