import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Only gates routes that require a real Supabase Auth session (the org owner / admin,
 * and — from Phase 5 — the platform admin). /leads, /collect, and /my-leads are
 * deliberately excluded: staff and rep check-in is a lightweight, no-password device
 * session (see src/lib/store.ts's loginAsStaff/loginAsRep), not Supabase Auth, and stays
 * protected client-side by useRequireRole as it already is.
 */
const PROTECTED_PREFIXES = ["/dashboard", "/admin", "/events", "/platform"];

const PLATFORM_LOGIN_PATH = "/platform/login";
const MAINTENANCE_PATH = "/maintenance";

// Site-wide maintenance mode rewrites every page request here EXCEPT the platform
// admin's own surface (it needs to stay reachable to turn maintenance mode back off)
// and this page itself (avoids a rewrite loop). API routes are deliberately left
// alone — Paystack's webhook in particular must keep working during a maintenance
// window, and every other route already does its own auth/authorization checks.
function isExemptFromMaintenance(pathname: string): boolean {
  return pathname === MAINTENANCE_PATH || pathname.startsWith("/platform") || pathname.startsWith("/api");
}

// Proxy runs on the Node.js runtime in this Next.js version (see proxy.js docs), so a
// plain module-level cache survives across requests on the same server instance —
// this keeps maintenance mode from adding a database round-trip to every single page
// load. Worst case (a fresh serverless instance, or the TTL just expired) is one
// extra query; nothing here depends on the cache being warm.
let maintenanceCache: { on: boolean; fetchedAt: number } | null = null;
const MAINTENANCE_CACHE_MS = 15_000;

async function isMaintenanceModeOn(supabaseUrl: string, supabaseAnonKey: string): Promise<boolean> {
  if (maintenanceCache && Date.now() - maintenanceCache.fetchedAt < MAINTENANCE_CACHE_MS) {
    return maintenanceCache.on;
  }
  let on = false;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/platform_settings?id=eq.true&select=maintenance_mode`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
    });
    if (res.ok) {
      const rows = (await res.json()) as { maintenance_mode: boolean }[];
      on = !!rows[0]?.maintenance_mode;
    }
    // A failed fetch leaves `on` false — fail open, same reasoning as the auth check
    // below: a Supabase hiccup should never be able to take the whole site offline.
  } catch {
    on = false;
  }
  maintenanceCache = { on, fetchedAt: Date.now() };
  return on;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseConfigured = !!supabaseUrl && !!supabaseAnonKey && supabaseUrl.startsWith("http");

  if (supabaseConfigured && !isExemptFromMaintenance(pathname)) {
    const maintenanceOn = await isMaintenanceModeOn(supabaseUrl, supabaseAnonKey);
    if (maintenanceOn) {
      return NextResponse.rewrite(new URL(MAINTENANCE_PATH, request.url));
    }
  }

  // Platform admin has its own login surface, decoupled from any organization
  // account — exclude it from the generic /platform protection below or a
  // signed-out visit would redirect to itself forever.
  if (pathname === PLATFORM_LOGIN_PATH) return response;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isProtected) return response;

  if (!supabaseConfigured) {
    // Supabase isn't configured yet (still placeholder values in .env.local) — fail
    // open rather than crashing every page. Each protected page still falls back to
    // its existing client-side useRequireRole() check.
    return response;
  }

  const supabase = createServerClient(supabaseUrl!, supabaseAnonKey!, {
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|apple-icon.png|icon.png|opengraph-image|robots.txt|sitemap.xml).*)"],
};
