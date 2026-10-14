import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isCustomerPath } from "@/lib/paths";

/**
 * Keeps the Supabase session fresh on every request, and sends visitors without a
 * session away from /admin and the customer pages before any page work happens. This is
 * only the optimistic check: each layout verifies the role on the server.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // getClaims() verifies the token; don't run code between creating the client and this call.
  const { data } = await supabase.auth.getClaims();

  const path = request.nextUrl.pathname;
  if (!data?.claims && (path.startsWith("/admin") || isCustomerPath(path))) {
    // Customers come back to the page they asked for; staff to the admin.
    const next = path.startsWith("/admin") ? "/admin" : path;
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = `?auth=login&next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
