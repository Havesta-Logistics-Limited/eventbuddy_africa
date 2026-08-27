import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyHubMember } from "@/lib/event-hub";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

type Body = { token: string };

/** Toggles this attendee's personal-agenda bookmark on a session — purely their
 *  own data, never visible to the organizer or any other attendee. */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/hub/sessions/[sessionId]/bookmark">) {
  const { slug, eventId, sessionId } = await ctx.params;
  const body = (await request.json()) as Partial<Body>;
  if (!body.token) return NextResponse.json({ error: "Missing access token." }, { status: 400 });

  if (!(await checkRateLimit(`hub-bookmark:token:${body.token}`, 30, 10 * 60))) {
    return rateLimitedResponse();
  }

  const admin = createAdminClient();
  const member = await verifyHubMember(admin, { slug, eventId, token: body.token });
  if (!member) return NextResponse.json({ error: "This link isn't valid — check your confirmation email for the right one." }, { status: 403 });

  const { data: session } = await admin.from("event_sessions").select("id").eq("id", sessionId).eq("event_id", eventId).maybeSingle();
  if (!session) return NextResponse.json({ error: "This session couldn't be found." }, { status: 404 });

  const { data: existing } = await admin
    .from("event_agenda_bookmarks")
    .select("id")
    .eq("session_id", sessionId)
    .eq("hub_member_id", member.memberId)
    .maybeSingle();

  if (existing) {
    const { error } = await admin.from("event_agenda_bookmarks").delete().eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, bookmarked: false });
  }

  const { error } = await admin.from("event_agenda_bookmarks").insert({ session_id: sessionId, hub_member_id: member.memberId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, bookmarked: true });
}
