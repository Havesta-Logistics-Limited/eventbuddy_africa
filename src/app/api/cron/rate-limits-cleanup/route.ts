import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Comfortably longer than any single window this app actually rate-limits
// against (the longest is forgot-password's 15 minutes) — a row this old has
// long since stopped mattering for throttling and is just accumulating.
const MAX_AGE_HOURS = 24;

/**
 * netlify/functions/rate-limits-cleanup-cron.mts hits this daily. The
 * rate_limits table (see 0034_rate_limits.sql) has one row per unique
 * key ever seen and nothing was ever deleting old ones — harmless at low
 * traffic, but unbounded growth with no cleanup at all. Guarded by
 * CRON_SECRET, same pattern as every other scheduled route.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000).toISOString();
  const { error, count } = await admin.from("rate_limits").delete({ count: "exact" }).lt("window_start", cutoff);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, deleted: count ?? 0 });
}
