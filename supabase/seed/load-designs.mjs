// J&J Sportswear: loads the shop's full-sublimation jersey designs into the catalog.
//
// Reads designs.json and the photos in design-photos/ (both next to this file) and,
// for each design, creates a made-to-order product with its description, tags,
// photos (full design first, as the main photo), and one variant per style × size
// at the list price, with SKUs like D01-NBS-M. Stock stays at 0: these are made to order.
//
// Needs migration 20261021000000_made_to_order.sql. Signs in as the owner, shows what
// it will add, and writes nothing until you type LOAD. Safe to run again: it only adds
// what's missing (a product, photo, tag, or variant that isn't there yet) and never
// changes or removes what's already saved, so edits made in the admin are kept.
//
//   node supabase/seed/load-designs.mjs

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ask, signInAsOwner } from "./owner-session.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { styles, sizes, designs } = JSON.parse(readFileSync(path.join(here, "designs.json"), "utf8"));
const photoFile = (p) => path.join(here, "design-photos", p);
// One photo per role, stored as {productId}/{role}.webp in the product-images bucket.
const storagePath = (id, photo) => `${id}/${path.basename(photo)}`;
const sku = (d, style, size) => `D${String(d.design).padStart(2, "0")}-${style.code}-${size}`;
const basePrice = Math.min(...styles.map((s) => s.price));

// Every photo must be on disk before anything is written.
for (const d of designs) for (const p of d.photos) readFileSync(photoFile(p));

const supabase = await signInAsOwner({ script: "supabase/seed/load-designs.mjs" });

// What's already there, so a second run only fills gaps.
const ids = designs.map((d) => d.id);
const { data: saved, error: loadError } = await supabase
  .from("products")
  .select("id, is_active, made_to_order, product_images (image_url, is_primary), product_variants (sku), product_tags (tag)")
  .in("id", ids);
if (loadError) {
  throw new Error(
    loadError.code === "42703"
      ? "The database needs migration 20261021000000_made_to_order.sql first."
      : `Couldn't read the catalog: ${loadError.message}`,
  );
}
const byId = new Map(saved.map((p) => [p.id, p]));
const publicUrl = (p) => supabase.storage.from("product-images").getPublicUrl(p).data.publicUrl;

const plan = designs.map((d) => {
  const have = byId.get(d.id);
  const urls = new Set((have?.product_images ?? []).map((i) => i.image_url));
  const skus = new Set((have?.product_variants ?? []).map((v) => v.sku));
  const tags = new Set((have?.product_tags ?? []).map((t) => t.tag.toLowerCase()));
  const photos = d.photos.filter((ph) => !urls.has(publicUrl(storagePath(d.id, ph))));
  const variants = styles.flatMap((style) => sizes.map((size) => ({ style, size, sku: sku(d, style, size) }))).filter((v) => !skus.has(v.sku));
  return {
    d,
    create: !have,
    // A load that stopped halfway leaves the product hidden; finishing it shows it. An archived
    // product that's complete stays archived.
    activate: !have || (!have.is_active && (photos.length > 0 || variants.length > 0)),
    photos,
    hasPrimary: (have?.product_images ?? []).some((i) => i.is_primary),
    tags: d.tags.filter((t) => !tags.has(t)),
    variants,
  };
});

// A SKU held by some other product would stop the load halfway; check them all first.
const wanted = plan.flatMap((p) => p.variants.map((v) => v.sku));
const clashes = [];
for (let i = 0; i < wanted.length; i += 300) {
  const { data, error } = await supabase.from("product_variants").select("sku, product_id").in("sku", wanted.slice(i, i + 300));
  if (error) throw new Error(`Couldn't check the SKUs: ${error.message}`);
  clashes.push(...data.filter((v) => !ids.includes(v.product_id)));
}
if (clashes.length) throw new Error(`These SKUs belong to other products: ${clashes.slice(0, 5).map((c) => c.sku).join(", ")}. Nothing was loaded.`);

const count = (f) => plan.reduce((n, p) => n + f(p), 0);
const totals = {
  products: count((p) => (p.create ? 1 : 0)),
  photos: count((p) => p.photos.length),
  tags: count((p) => p.tags.length),
  variants: count((p) => p.variants.length),
};
console.log(`\n  ${designs.length} designs in designs.json, ${saved.length} already in the catalog.`);
console.log(`  To add: ${totals.products} products, ${totals.photos} photos, ${totals.tags} tags, ${totals.variants} variants.`);
console.log(`  Styles: ${styles.map((s) => `${s.name} ₱${s.price}`).join(", ")}. Sizes ${sizes[0]}–${sizes[sizes.length - 1]}.`);
if (!Object.values(totals).some(Boolean)) {
  console.log("Everything is already loaded.");
  process.exit(0);
}
if ((await ask("\nType LOAD to add them: ")) !== "LOAD") {
  console.log("Stopped. Nothing was changed.");
  process.exit(0);
}

const fail = (d, what, error) => {
  throw new Error(`Stopped at ${d.name} (design ${d.design}): couldn't ${what}. ${error.message ?? error} Run the script again to pick up from here.`);
};

let done = 0;
for (const p of plan) {
  const { d } = p;
  if (!p.create && !p.photos.length && !p.tags.length && !p.variants.length) {
    done++;
    continue;
  }

  // 1. The product, hidden until everything else is in place.
  if (p.create) {
    const { error } = await supabase.from("products").insert({
      id: d.id,
      name: d.name,
      description: d.description,
      base_price: basePrice,
      made_to_order: true,
      is_active: false,
    });
    if (error) fail(d, "create the product", error);
  }

  // 2. Tags.
  if (p.tags.length) {
    const { error } = await supabase.from("product_tags").insert(p.tags.map((tag) => ({ product_id: d.id, tag })));
    if (error) fail(d, "add its tags", error);
  }

  // 3. Photos: upload (an already-uploaded file is fine), then record them. The full design leads.
  let primarySet = p.hasPrimary;
  for (const photo of p.photos) {
    const target = storagePath(d.id, photo);
    const up = await supabase.storage
      .from("product-images")
      .upload(target, readFileSync(photoFile(photo)), { contentType: "image/webp", upsert: false });
    if (up.error && !/exists|duplicate/i.test(up.error.message)) fail(d, `upload ${photo}`, up.error);
    const isPrimary = !primarySet && photo === d.photos[0];
    const { error } = await supabase.from("product_images").insert({ product_id: d.id, image_url: publicUrl(target), is_primary: isPrimary });
    if (error) fail(d, `record ${photo}`, error);
    if (isPrimary) primarySet = true;
  }

  // 4. Variants: every style in every size, at the style's price, with no stock.
  if (p.variants.length) {
    const { error } = await supabase.from("product_variants").insert(
      p.variants.map((v) => ({
        product_id: d.id,
        size: v.size,
        color: v.style.name,
        sku: v.sku,
        price: v.style.price,
        stock_quantity: 0,
        is_active: true,
      })),
    );
    if (error) fail(d, "add its sizes and styles", error);
  }

  // 5. In the catalog.
  if (p.activate) {
    const { error } = await supabase.from("products").update({ is_active: true }).eq("id", d.id);
    if (error) fail(d, "add it to the catalog", error);
  }
  done++;
  process.stdout.write(`\r  Loaded ${done} of ${designs.length}: ${d.name.slice(0, 40).padEnd(40)}`);
}

console.log(`\nDone. ${designs.length} designs are in the catalog.`);
await supabase.auth.signOut();
