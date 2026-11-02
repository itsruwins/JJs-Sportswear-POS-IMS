"use server";

import { ownerSession, requireStaff } from "@/features/admin/shell/session";
import { hasStockHistory } from "@/features/admin/stock/data";
import {
  normalizeTags,
  validateProduct,
  variantKey,
  type FieldErrors,
  type ProductInput,
  type VariantInput,
} from "./validation";

export type ActionResult = { ok: true; id: string } | { ok: false; message: string; fieldErrors?: FieldErrors };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/`;
const PHOTO_FILE = /^[A-Za-z0-9-]+\.(webp|jpe?g|png)$/;

const fail = (message: string, fieldErrors?: FieldErrors): ActionResult => ({ ok: false, message, fieldErrors });

/** The storage path of a photo in this project's product-images bucket, or null for anything else. */
function storagePath(url: string) {
  if (!url.startsWith(BUCKET_URL)) return null;
  const path = decodeURIComponent(url.slice(BUCKET_URL.length).split("?")[0]);
  return path.includes("..") ? null : path;
}

/** True only for a photo uploaded straight into this product's own folder. */
function isOwnUpload(url: string, productId: string) {
  const path = storagePath(url);
  if (!path) return false;
  const [folder, file, ...rest] = path.split("/");
  return folder === productId && rest.length === 0 && PHOTO_FILE.test(file ?? "");
}

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function clean(raw: ProductInput): ProductInput {
  return {
    id: str(raw?.id),
    name: str(raw?.name).trim(),
    description: str(raw?.description).trim(),
    made_to_order: raw?.made_to_order === true,
    base_price: Number(raw?.base_price),
    tags: normalizeTags(list<unknown>(raw?.tags).map(str)),
    images: list<ProductInput["images"][number]>(raw?.images).map((i) => ({
      id: i?.id ? str(i.id) : undefined,
      url: str(i?.url),
      is_primary: Boolean(i?.is_primary),
    })),
    known_image_urls: list<unknown>(raw?.known_image_urls).map(str),
    variants: list<VariantInput>(raw?.variants).map((v) => ({
      id: v?.id ? str(v.id) : undefined,
      size: str(v?.size).trim(),
      color: str(v?.color).trim(),
      sku: str(v?.sku).trim().toUpperCase(),
      price: Number(v?.price),
      low_stock_threshold: Number(v?.low_stock_threshold),
      opening_stock: Number(v?.opening_stock ?? 0),
      is_active: Boolean(v?.is_active),
    })),
  };
}

type DbError = { code?: string; message?: string; details?: string } | null | undefined;

function dbMessage(error: DbError, fallback: string) {
  const text = `${error?.message ?? ""} ${error?.details ?? ""}`;
  if (error?.code === "23505") {
    if (/sku/i.test(text)) return "One of these SKUs is already in use. Change it and save again.";
    if (/size_color/i.test(text)) return "One of these sizes and colors already exists on this product. Reload the page and try again.";
    if (/primary/i.test(text)) return "Only one photo can be the main photo. Reload the page and try again.";
    return "Something here already exists. Reload the page and try again.";
  }
  if (error?.code === "42501") return "Your account isn’t allowed to do that.";
  if (error?.code === "42703" && /made_to_order/.test(text)) return MIGRATION_MESSAGE;
  // The database's own made-to-order rules (migration 20261021000000_made_to_order.sql).
  if (error?.code === "P0001" && /made to order|made-to-order/i.test(text)) return error.message ?? fallback;
  return fallback;
}

const MIGRATION_MESSAGE = "Made to order needs the shop’s latest database update (20261021000000_made_to_order.sql).";

type SavedVariant = { id: string; size: string | null; color: string | null; sku: string | null; stock_quantity: number };
type SavedImage = { id: string; image_url: string; is_primary: boolean };

/**
 * Creates or updates a product with its tags, photos, and variants.
 * Each step moves the product toward exactly what the form shows, so retrying after a
 * failure converges instead of duplicating or losing anything. New products stay hidden
 * from the shop until every step has succeeded.
 */
export async function saveProduct(raw: ProductInput, mode: "create" | "update"): Promise<ActionResult> {
  const session = await ownerSession();
  if (!session) return fail("Only the owner can add or change products.");
  const { supabase } = session;
  const input = clean(raw);
  if (!UUID.test(input.id)) return fail("This form is out of date. Reload the page and try again.");

  const fieldErrors = validateProduct(input);
  if (Object.keys(fieldErrors).length) return fail("Some fields need a look before saving.", fieldErrors);

  const { data: existing, error: loadError } = await supabase
    .from("products")
    .select(
      "id, product_variants (id, size, color, sku, stock_quantity), product_images (id, image_url, is_primary), product_tags (id, tag)",
    )
    .eq("id", input.id)
    .maybeSingle();
  if (loadError) return fail("We couldn’t reach the database. Check your connection and try again.");
  if (!existing && mode === "update") return fail("This product doesn’t exist anymore.");

  const savedVariants = (existing?.product_variants ?? []) as SavedVariant[];

  // Switching to made to order with stock on the shelf would leave that stock uncounted.
  if (input.made_to_order) {
    const pieces = savedVariants.reduce((sum, v) => sum + Math.max(0, v.stock_quantity), 0);
    if (pieces > 0) {
      const message = `This product still has ${pieces} in stock. Adjust every size to 0 first, then make it made to order.`;
      return fail(message, { made_to_order: message });
    }
  }
  const savedImages = (existing?.product_images ?? []) as SavedImage[];
  const savedTags = (existing?.product_tags ?? []) as { id: string; tag: string }[];

  // New photos must have been uploaded into this product's own folder.
  const savedUrls = new Set(savedImages.map((i) => i.image_url));
  if (input.images.some((i) => !savedUrls.has(i.url) && !isOwnUpload(i.url, input.id))) {
    return fail("A photo didn’t upload properly. Remove it and add it again.");
  }

  // Match each row to a saved variant: by id when the id really is that size and color, else by size and color.
  const byId = new Map(savedVariants.map((v) => [v.id, v]));
  const byKey = new Map(savedVariants.map((v) => [variantKey({ size: v.size ?? "", color: v.color ?? "" }), v]));
  const updates: (VariantInput & { id: string })[] = [];
  const inserts: VariantInput[] = [];
  for (const v of input.variants) {
    const key = variantKey(v);
    const fromId = v.id ? byId.get(v.id) : undefined;
    const match =
      fromId && variantKey({ size: fromId.size ?? "", color: fromId.color ?? "" }) === key ? fromId : byKey.get(key);
    if (match) updates.push({ ...v, id: match.id });
    else if (v.is_active) inserts.push(v); // a new size/color left hidden isn't worth creating
  }
  // Count visible variants, not new inserts: a retried create finds its variants already saved.
  if (mode === "create" && inserts.length + updates.filter((u) => u.is_active).length === 0) {
    return fail("Turn on “Visible” for at least one size and color.", { variants: "Turn on “Visible” for at least one size and color." });
  }
  const keep = new Set(updates.map((v) => v.id));
  const toHide = savedVariants.filter((v) => !keep.has(v.id));

  // SKUs: each must be free, or owned by the very variant using it, or released by another variant in this save.
  const skus = input.variants.map((v) => v.sku);
  const { data: owners, error: skuError } = await supabase
    .from("product_variants")
    .select("id, sku, product_id, size, color")
    .in("sku", skus);
  if (skuError) return fail("We couldn’t check the SKUs. Try again.");
  const nextSkuById = new Map(updates.map((v) => [v.id, v.sku]));
  const targetByKey = new Map(updates.map((v) => [variantKey(v), v.id]));
  const skuErrors: FieldErrors = {};
  for (const v of input.variants) {
    const target = targetByKey.get(variantKey(v));
    const owner = (owners ?? []).find((o) => o.sku === v.sku);
    if (!owner || owner.id === target) continue;
    const field = `variants.${variantKey(v)}.sku`;
    if (owner.product_id !== input.id) skuErrors[field] = "Another product already uses this SKU.";
    else if (nextSkuById.has(owner.id) && nextSkuById.get(owner.id) !== v.sku) continue; // being released
    else skuErrors[field] = `${owner.color ?? ""} ${owner.size ?? ""} of this product (now hidden) still uses this SKU. Use a different one.`.trim();
  }
  if (Object.keys(skuErrors).length) return fail("Some SKUs are already in use.", skuErrors);

  // 1. The product row. New products start hidden and are switched on at the very end.
  // Before the made-to-order migration, a stocked product still saves (the column is left out).
  const base = { name: input.name, description: input.description || null, base_price: input.base_price };
  const fields = { ...base, made_to_order: input.made_to_order };
  const writeProduct = async (row: typeof base) =>
    existing
      ? supabase.from("products").update(row).eq("id", input.id)
      : supabase.from("products").insert({ id: input.id, ...row, is_active: false });
  {
    let { error } = await writeProduct(fields);
    if (error?.code === "42703" && /made_to_order/.test(`${error.message}`) && !input.made_to_order) ({ error } = await writeProduct(base));
    if (error) return fail(dbMessage(error, existing ? "We couldn’t save the product details. Try again." : "We couldn’t create the product. Try again."));
  }

  // 2. Tags: add what's missing, remove what's gone.
  {
    const want = new Set(input.tags);
    const have = new Set(savedTags.map((t) => t.tag.toLowerCase()));
    const extra = savedTags.filter((t) => !want.has(t.tag.toLowerCase()));
    const missing = input.tags.filter((t) => !have.has(t));
    if (missing.length) {
      const { error } = await supabase.from("product_tags").insert(missing.map((tag) => ({ product_id: input.id, tag })));
      if (error) return fail(dbMessage(error, "We couldn’t save the tags. Try again."));
    }
    if (extra.length) {
      const { error } = await supabase.from("product_tags").delete().in("id", extra.map((t) => t.id));
      if (error) return fail(dbMessage(error, "We couldn’t save the tags. Try again."));
    }
  }

  // 3. Photos: the form's list is the whole set. Remove anything not in it, add new ones, then set the main photo.
  {
    const wantUrls = new Set(input.images.map((i) => i.url));
    const known = new Set(input.known_image_urls);
    const removed = savedImages.filter((s) => known.has(s.image_url) && !wantUrls.has(s.image_url));
    if (removed.length) {
      const { error } = await supabase.from("product_images").delete().in("id", removed.map((r) => r.id));
      if (error) return fail(dbMessage(error, "We couldn’t remove a photo. Try again."));
      const paths = removed.map((r) => storagePath(r.image_url)).filter((p): p is string => !!p && p.startsWith(`${input.id}/`));
      if (paths.length) await supabase.storage.from("product-images").remove(paths);
    }
    const fresh = input.images.filter((i) => !savedUrls.has(i.url));
    if (fresh.length) {
      const { error } = await supabase
        .from("product_images")
        .insert(fresh.map((i) => ({ product_id: input.id, image_url: i.url, is_primary: false })));
      if (error) return fail(dbMessage(error, "We couldn’t save the photos. Try again."));
    }
    const main = input.images.find((i) => i.is_primary);
    const currentMain = savedImages.find((s) => s.is_primary && wantUrls.has(s.image_url));
    if (main && currentMain?.image_url !== main.url) {
      const { error: offError } = await supabase.from("product_images").update({ is_primary: false }).eq("product_id", input.id);
      if (offError) return fail(dbMessage(offError, "We couldn’t set the main photo. Try again."));
      const { error } = await supabase
        .from("product_images")
        .update({ is_primary: true })
        .eq("product_id", input.id)
        .eq("image_url", main.url);
      if (error) return fail(dbMessage(error, "We couldn’t set the main photo. Try again."));
    }
  }

  // 4. Variants. A SKU another row is taking over is cleared first, so two variants can swap SKUs.
  const takenOver = updates
    .filter((v) => {
      const old = byId.get(v.id)?.sku;
      return old && old !== v.sku && input.variants.some((other) => other.sku === old);
    })
    .map((v) => v.id);
  if (takenOver.length) {
    const { error } = await supabase.from("product_variants").update({ sku: null }).in("id", takenOver);
    if (error) return fail(dbMessage(error, "We couldn’t update the SKUs. Try again."));
  }
  for (const v of updates) {
    const { error } = await supabase
      .from("product_variants")
      .update({ sku: v.sku, price: v.price, low_stock_threshold: v.low_stock_threshold, is_active: v.is_active })
      .eq("id", v.id);
    if (error) return fail(dbMessage(error, `We couldn’t save ${v.color} ${v.size}. Try again.`));
  }
  if (inserts.length) {
    // The database logs each opening stock as a restock by the signed-in staff member.
    const { error } = await supabase.from("product_variants").insert(
      inserts.map((v) => ({
        product_id: input.id,
        size: v.size,
        color: v.color,
        sku: v.sku,
        price: v.price,
        low_stock_threshold: v.low_stock_threshold,
        stock_quantity: input.made_to_order ? 0 : v.opening_stock,
        is_active: true,
      })),
    );
    if (error) return fail(dbMessage(error, "We couldn’t add the new sizes and colors. Try again."));
  }
  const hide = toHide.map((v) => v.id);
  if (hide.length) {
    const { error } = await supabase.from("product_variants").update({ is_active: false }).in("id", hide);
    if (error) return fail(dbMessage(error, "We couldn’t hide the removed sizes and colors. Try again."));
  }

  // 5. Everything is in place: a new product joins the catalog.
  if (mode === "create") {
    const { error } = await supabase.from("products").update({ is_active: true }).eq("id", input.id);
    if (error) return fail(dbMessage(error, "Saved, but we couldn’t add it to the catalog. Save again."));
  }

  return { ok: true, id: input.id };
}

export async function setProductArchived(id: string, archived: boolean): Promise<ActionResult> {
  const session = await ownerSession();
  if (!session) return fail("Only the owner can archive or restore products.");
  const { supabase } = session;
  if (!UUID.test(id)) return fail("That product doesn’t exist.");
  const { data, error } = await supabase.from("products").update({ is_active: !archived }).eq("id", id).select("id");
  if (error) return fail(dbMessage(error, archived ? "We couldn’t archive it. Try again." : "We couldn’t restore it. Try again."));
  if (!data?.length) return fail("That product doesn’t exist anymore.");
  return { ok: true, id };
}

/** Owner only, and only for products that never held stock; everything else is archived instead. */
export async function deleteProduct(id: string): Promise<ActionResult> {
  const { supabase, profile } = await requireStaff();
  if (profile.role !== "owner") return fail("Only the owner can delete products. Archive it instead.");
  if (!UUID.test(id)) return fail("That product doesn’t exist.");

  const { data: product, error: loadError } = await supabase
    .from("products")
    .select("id, product_variants (id)")
    .eq("id", id)
    .maybeSingle();
  if (loadError) return fail("We couldn’t reach the database. Try again.");
  if (!product) return fail("That product doesn’t exist anymore.");

  try {
    const ids = (product.product_variants ?? []).map((v: { id: string }) => v.id);
    if (await hasStockHistory(supabase, ids)) {
      return fail("This product has stock history, so it can’t be deleted. Archive it instead to hide it from the shop.");
    }
  } catch {
    return fail("We couldn’t check this product’s stock history. Try again.");
  }

  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return fail(dbMessage(error, "We couldn’t delete it. Try again."));

  // Remove every file in the product's folder, including uploads from saves that never finished.
  const storage = supabase.storage.from("product-images");
  const { data: files } = await storage.list(id, { limit: 100 });
  const paths = (files ?? []).map((f) => `${id}/${f.name}`);
  if (paths.length) await storage.remove(paths);
  return { ok: true, id };
}
