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

import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";

const BUCKETS = ["order-references", "order-photos", "payment-proofs", "pos-receipts", "chat-photos", "ai-designs", "product-images"];

// Problems print as one plain line, not a stack trace.
process.on("uncaughtException", (e) => {
  console.error(`\n${e.message}`);
  process.exit(1);
});

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("Run this from the project folder: .env.local needs the Supabase URL and publishable key.");
if (!process.stdin.isTTY) {
  console.error("This script asks for the owner's password, so it needs a terminal you can type in.");
  console.error("Open Terminal (or the VS Code terminal), go to the project folder, and run:");
  console.error("  node supabase/seed/empty-storage.mjs");
  process.exit(1);
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    }),
  );
}

/** Reads a line without showing it: keys are taken one by one and never echoed. */
function askHidden(question) {
  process.stdout.write(question);
  const stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  let value = "";
  return new Promise((resolve) => {
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          // Ctrl+C
          stdin.setRawMode(false);
          process.stdout.write("\nStopped. Nothing was deleted.\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

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

const supabase = createClient(url, key, { auth: { persistSession: false } });

// Accounts sign in by username; the app logs in with a placeholder email made from it
// (features/shared/auth/credentials.ts, usernameToEmail).
const username = await ask("Owner username: ");
const email = `${username.toLowerCase()}@jjsportswear.local`;
const password = await askHidden("Password (hidden as you type): ");
const { data: auth, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
if (signInError) throw new Error(`Sign-in failed: ${signInError.message}`);

const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
if (profile?.role !== "owner") throw new Error("That account isn't the owner. Only the owner can empty the buckets.");

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
