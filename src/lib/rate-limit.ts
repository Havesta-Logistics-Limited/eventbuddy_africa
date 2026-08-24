import { createAdminClient } from "@/lib/supabase/admin";

/** Best-effort real client IP behind Netlify/most proxies — checked in order of
 *  trustworthiness for this deployment. Falls back to a constant so a missing
 *  header degrades to "everyone shares one bucket" rather than throwing; that's a
 *  worse rate limit, not a broken route. */
export function clientIp(request: Request): string {
  return (
    request.headers.get("x-nf-client-connection-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/**
 * Atomic fixed-window counter backed by the check_rate_limit Postgres function
 * (see supabase/migrations/0034_rate_limits.sql) — one round trip, no read-then-write
 * race between concurrent requests. Fails OPEN on any infra error (missing
 * migration, DB hiccup): a rate limiter outage should never itself take down
 * signup/checkout, matching how every email send in this app is best-effort.
 */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("check_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
    if (error) {
      console.error(`[rate-limit] check failed for key "${key}":`, error.message);
      return true;
    }
    return data as boolean;
  } catch (err) {
    console.error(`[rate-limit] check threw for key "${key}":`, err instanceof Error ? err.message : err);
    return true;
  }
}

export function rateLimitedResponse() {
  return Response.json({ error: "Too many requests — please wait a bit and try again." }, { status: 429 });
}
