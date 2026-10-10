import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderBriefing, sendBriefing, type BriefingData } from "@/lib/morning-briefing";
import { withCronLog } from "@/lib/cron-log";

/**
 * netlify/functions/morning-briefing-cron.mts hits this at 7am Lagos time
 * (migration 0124): emails info@eventbuddy.africa (BRIEFING_TO) yesterday's numbers, what's
 * waiting on them, today's events and any scheduled job that failed. Skipped
 * when switched off (platform_settings.morning_briefing_enabled). Guarded by
 * CRON_SECRET.
 *
 * For checking it, also with the secret: ?preview=1 returns the email as a
 * page instead of sending; ?to=a@b.c sends only to that address; ?day=YYYY-MM-DD
 * reports that day; ?test=1 includes test-mode payments.
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const preview = url.searchParams.get("preview") === "1";
  const to = url.searchParams.get("to");
  const day = url.searchParams.get("day");
  const admin = createAdminClient();

  if (!preview && !to) {
    const { data: settings } = await admin.from("platform_settings").select("morning_briefing_enabled").eq("id", true).maybeSingle();
    if (settings && settings.morning_briefing_enabled === false) return NextResponse.json({ success: true, skipped: "switched off" });
  }

  const { data, error } = await admin.rpc("platform_briefing", {
    p_include_test: url.searchParams.get("test") === "1",
    p_day: day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || url.origin;
  const email = renderBriefing(data as BriefingData, siteUrl);
  if (preview) return new NextResponse(`<!doctype html><title>${email.subject}</title>${email.html}`, { headers: { "Content-Type": "text/html; charset=utf-8" } });

  const result = await sendBriefing(email, to ? [to] : undefined);
  if (result.error && result.sent === 0) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ success: true, sent: result.sent, ...(result.error ? { warning: result.error } : {}) });
}

// every run is recorded for the platform admin's Job health tab
export const GET = withCronLog("morning-briefing", run);
