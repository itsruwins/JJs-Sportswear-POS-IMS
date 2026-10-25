// J&J Sportswear: clean slate for uploaded files (one time, with wipe-all-data.sql).
//
// Empties the data buckets: order references, finished-order photos, payment
// proofs, POS receipt photos, chat photos, saved AI designs, and product photos.
// Profile photos (avatars) and the shop's QR codes (shop-accounts) stay.
//
// Needs migration 20261020000000_owner_storage_cleanup.sql, and signs in as the
// owner because .env.local holds no server key. It counts the files first and
// deletes nothing until you type DELETE.
//
// Run it in your own terminal (Terminal app or the VS Code terminal), from the
// project folder, so it can ask for the password:
//
//   node supabase/seed/empty-storage.mjs

import { ask, signInAsOwner } from "./owner-session.mjs";

const BUCKETS = ["order-references", "order-photos", "payment-proofs", "pos-receipts", "chat-photos", "ai-designs", "product-images"];

/** Every file path in a bucket. Folders come back from list() with no id. */
async function listAll(storage, prefix = "") {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await storage.list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`Couldn't list ${prefix || "the bucket"}: ${error.message}`);
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) files.push(...(await listAll(storage, path)));
      else if (item.name !== ".emptyFolderPlaceholder") files.push(path);
    }
    if (data.length < 1000) return files;
  }
}

const supabase = await signInAsOwner({ script: "supabase/seed/empty-storage.mjs", stopped: "Stopped. Nothing was deleted." });

const found = [];
for (const bucket of BUCKETS) {
  const paths = await listAll(supabase.storage.from(bucket));
  found.push({ bucket, paths });
  console.log(`  ${bucket.padEnd(18)} ${paths.length} file${paths.length === 1 ? "" : "s"}`);
}
const total = found.reduce((n, b) => n + b.paths.length, 0);
if (total === 0) {
  console.log("Nothing to delete.");
  process.exit(0);
}

if ((await ask(`Delete all ${total} files? This can't be undone. Type DELETE to go ahead: `)) !== "DELETE") {
  console.log("Stopped. Nothing was deleted.");
  process.exit(0);
}

let deleted = 0;
for (const { bucket, paths } of found) {
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { data, error } = await supabase.storage.from(bucket).remove(batch);
    if (error) throw new Error(`Stopped in ${bucket} after ${deleted} files: ${error.message}`);
    deleted += data.length;
  }
}

// remove() skips files the policies don't allow, without an error, so count again.
let left = 0;
for (const { bucket } of found) left += (await listAll(supabase.storage.from(bucket))).length;
console.log(left ? `Deleted ${deleted}; ${left} are still there (has the migration run?).` : `Deleted all ${deleted} files.`);
await supabase.auth.signOut();
