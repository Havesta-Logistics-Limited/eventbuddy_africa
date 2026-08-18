import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Only gates routes that require a real Supabase Auth session (the org owner / admin,
 * and — from Phase 5 — the platform admin). /leads, /collect, and /my-leads are
 * deliberately excluded: staff and rep check-in is a lightweight, no-password device
 * session (see src/lib/store.ts's loginAsStaff/loginAsRep), not Supabase Auth, and stays
 * protected client-side by useRequireRole as it already is.
 */
const PROTECTED_PREFIXES = ["/dashboard", "/analytics", "/admin", "/events", "/platform"];

const PLATFORM_LOGIN_PATH = "/platform/login";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

  // Platform admin has its own login surface, decoupled from any organization
  // account — exclude it from the generic /platform protection below or a
  // signed-out visit would redirect to itself forever.
  if (pathname === PLATFORM_LOGIN_PATH) return response;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isProtected) return response;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey || !supabaseUrl.startsWith("http")) {
    // Supabase isn't configured yet (still placeholder values in .env.local) — fail
    // open rather than crashing every page. Each protected page still falls back to
    // its existing client-side useRequireRole() check.
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.startsWith("/platform") ? PLATFORM_LOGIN_PATH : "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/analytics/:path*", "/admin/:path*", "/events/:path*", "/platform/:path*"],
};
