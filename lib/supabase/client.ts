import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client. Sessions are kept in cookies so server code can read them later. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
