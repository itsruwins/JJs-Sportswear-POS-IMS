// Shared by the one-time seed scripts: asks for the owner's username and password in the
// terminal and signs in with them, since .env.local holds no server key. Run the scripts
// from the project folder in your own terminal (Terminal app or the VS Code terminal).

import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";

// Problems print as one plain line, not a stack trace.
process.on("uncaughtException", (e) => {
  console.error(`\n${e.message}`);
  process.exit(1);
});

export function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    }),
  );
}

/** Reads a line without showing it: keys are taken one by one and never echoed. */
function askHidden(question, stoppedMessage) {
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
          process.stdout.write(`\n${stoppedMessage}\n`);
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

/**
 * Signs in as the owner and returns the Supabase client. `script` is the file to tell the
 * user to run when there's no terminal; `stopped` is what Ctrl+C at the password says.
 */
export async function signInAsOwner({ script, stopped = "Stopped. Nothing was changed." }) {
  process.loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Run this from the project folder: .env.local needs the Supabase URL and publishable key.");
  if (!process.stdin.isTTY) {
    console.error("This script asks for the owner's password, so it needs a terminal you can type in.");
    console.error("Open Terminal (or the VS Code terminal), go to the project folder, and run:");
    console.error(`  node ${script}`);
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  // Accounts sign in by username; the app logs in with a placeholder email made from it
  // (features/shared/auth/credentials.ts, usernameToEmail).
  const username = await ask("Owner username: ");
  const email = `${username.toLowerCase()}@jjsportswear.local`;
  const password = await askHidden("Password (hidden as you type): ", stopped);
  const { data: auth, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed: ${error.message}`);

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profile?.role !== "owner") throw new Error("That account isn't the owner. Only the owner can run this.");
  return supabase;
}
