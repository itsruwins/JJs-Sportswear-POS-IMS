"use server";

import { revalidatePath } from "next/cache";
import { manilaDay } from "./data";
import { buildPrompt, buildRefinePrompt, cleanPicks, DESIGNS_PER_DAY, type DesignPicks } from "./model";
import { FluxError, fluxConfigured, fluxGenerate } from "./flux";
import { requireCustomer } from "@/features/customer/shell/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** FLUX fetches reference images itself, so they get short-lived links. */
const REFERENCE_LINK_FOR = 10 * 60;

export type DesignResult = { ok: true; id: string } | { ok: false; message: string; limit?: boolean };

const LIMIT_MESSAGE = `You’ve used today’s ${DESIGNS_PER_DAY} designs. You can make more tomorrow.`;
const OFF_MESSAGE = "The AI designer isn’t on yet. Check back soon.";

/**
 * Makes one design with FLUX.2 and saves it. Without the shop's key there's nothing to
 * make it with. Nothing is saved (or counted) unless an image came back.
 */
async function make(
  prompt: string,
  picks: DesignPicks,
  references: { parentPath?: string | null },
  parentId: string | null,
): Promise<DesignResult> {
  if (!fluxConfigured()) return { ok: false, message: OFF_MESSAGE };
  const { supabase, profile } = await requireCustomer();

  // The database enforces the limit too; checking first spares a paid generation.
  const { count } = await supabase
    .from("ai_designs")
    .select("id", { count: "exact", head: true })
    .eq("attempt_date", manilaDay());
  if ((count ?? 0) >= DESIGNS_PER_DAY) return { ok: false, message: LIMIT_MESSAGE, limit: true };

  let image: { bytes: Buffer; type: string; ext: string };
  try {
    const paths = [references.parentPath, picks.logoPath].filter((p): p is string => Boolean(p));
    const signed = paths.length ? await supabase.storage.from("ai-designs").createSignedUrls(paths, REFERENCE_LINK_FOR) : null;
    const urls = (signed?.data ?? []).map((s) => s.signedUrl).filter((u): u is string => Boolean(u));
    const out = await fluxGenerate(prompt, urls);
    image = { ...out, ext: out.type.includes("png") ? "png" : out.type.includes("webp") ? "webp" : "jpg" };
  } catch (e) {
    return { ok: false, message: e instanceof FluxError ? e.message : "We couldn’t make that design. Try again in a moment." };
  }

  const path = `${profile.id}/${crypto.randomUUID()}.${image.ext}`;
  const up = await supabase.storage.from("ai-designs").upload(path, image.bytes, { contentType: image.type });
  if (up.error) return { ok: false, message: "The design was made but couldn’t be saved. Try again." };

  const row = { prompt, generated_image_url: path, details: picks, parent_id: parentId };
  let ins = await supabase.from("ai_designs").insert(row).select("id").single();
  if (ins.error?.code === "42703" || ins.error?.code === "PGRST204") {
    // Before the studio migration: save what the original table holds.
    ins = await supabase.from("ai_designs").insert({ prompt, generated_image_url: path }).select("id").single();
  }
  if (ins.error || !ins.data) {
    await supabase.storage.from("ai-designs").remove([path]);
    if (ins.error?.code === "P0001") return { ok: false, message: LIMIT_MESSAGE, limit: true };
    return { ok: false, message: "The design was made but couldn’t be saved. Try again." };
  }
  revalidatePath("/design");
  return { ok: true, id: (ins.data as { id: string }).id };
}

export async function generateDesign(rawPicks: DesignPicks): Promise<DesignResult> {
  const { profile } = await requireCustomer();
  const picks = cleanPicks(rawPicks, profile.id);
  if (!picks) return { ok: false, message: "Pick a garment, a sport, a style, and at least one color." };
  return make(buildPrompt(picks, Boolean(picks.logoPath)), picks, {}, null);
}

/** Refines one of the customer's designs: FLUX gets the design back with the change asked for. */
export async function refineDesign(parentId: string, change: string): Promise<DesignResult> {
  if (typeof parentId !== "string" || !UUID.test(parentId)) return { ok: false, message: "That design doesn’t exist anymore." };
  const text = typeof change === "string" ? change.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  if (text.length < 3) return { ok: false, message: "Say what to change, like “make the stripes thinner”." };
  const { supabase, profile } = await requireCustomer();
  const { data: parent } = await supabase
    .from("ai_designs")
    .select("id, generated_image_url, details")
    .eq("id", parentId)
    .maybeSingle<{ id: string; generated_image_url: string | null; details: DesignPicks | null }>();
  if (!parent?.generated_image_url) return { ok: false, message: "That design doesn’t exist anymore." };
  // A refinement keeps the picks; the change itself is in the prompt.
  const picks = cleanPicks({ ...(parent.details ?? {}), extra: text }, profile.id) ?? cleanPicks({ garment: "Jersey", sport: "Basketball", style: "classic", colors: ["Black"], extra: text }, profile.id)!;
  return make(buildRefinePrompt(text), picks, { parentPath: parent.generated_image_url }, parent.id);
}
