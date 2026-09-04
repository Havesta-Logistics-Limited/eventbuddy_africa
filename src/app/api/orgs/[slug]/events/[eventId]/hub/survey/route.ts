import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyHubMember } from "@/lib/event-hub";
import { getEventStatus } from "@/lib/capture-window";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

type Body = { token?: string; answers?: Record<string, string | string[]> };

/**
 * Submits this attendee's post-event survey response — one per hub_member_id
 * (unique(event_id, hub_member_id), migration 0064), same "only ever through the
 * Hub's own trust boundary" model as every other attendee-facing Hub write. Only
 * accepted once the event has actually ended, mirroring what the Hub GET route
 * decides to even show the form for — never trust the client on that, since the
 * gate exists to keep this a genuinely POST-event survey, not a stray write path.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/hub/survey">) {
  const { slug, eventId } = await ctx.params;
  const body = (await request.json().catch(() => null)) as Body | null;
  const token = body?.token;
  const answers = body?.answers;
  if (!token || !answers || typeof answers !== "object") {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  if (!(await checkRateLimit(`hub-survey:token:${token}`, 5, 10 * 60))) {
    return rateLimitedResponse();
  }

  const admin = createAdminClient();
  const member = await verifyHubMember(admin, { slug, eventId, token });
  if (!member) return NextResponse.json({ error: "This link isn't valid — check your confirmation email for the right one." }, { status: 403 });

  const { data: event } = await admin
    .from("events")
    .select("date, end_date, start_time, end_time, timezone, survey_enabled")
    .eq("id", eventId)
    .eq("organization_id", member.organizationId)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });
  if (!event.survey_enabled) return NextResponse.json({ error: "This event doesn't have a survey." }, { status: 403 });

  const status = getEventStatus({ date: event.date, endDate: event.end_date ?? undefined, startTime: event.start_time ?? undefined, endTime: event.end_time ?? undefined, timezone: event.timezone ?? undefined });
  if (status !== "completed") return NextResponse.json({ error: "This event hasn't ended yet." }, { status: 403 });

  const { error } = await admin
    .from("event_survey_responses")
    .upsert({ organization_id: member.organizationId, event_id: eventId, hub_member_id: member.memberId, answers }, { onConflict: "event_id,hub_member_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
