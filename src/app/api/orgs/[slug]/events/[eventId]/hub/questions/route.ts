import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyHubMember } from "@/lib/event-hub";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

type SubmitBody = { token: string; questionText: string; sessionId?: string; speakerId?: string };

/**
 * Attendee submits a question — always lands as 'pending', never visible to anyone
 * but the organizer's moderation queue until explicitly approved (see
 * event_questions_all_own_org in 0035_event_hub.sql). Same token trust boundary as
 * the GET route. Rate-limited per token, not IP — a shared venue WiFi shouldn't
 * throttle everyone at once, but one attendee flooding the queue should.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/hub/questions">) {
  const { slug, eventId } = await ctx.params;
  const body = (await request.json()) as Partial<SubmitBody>;
  const { token, questionText, sessionId, speakerId } = body;

  if (!token || !questionText?.trim()) {
    return NextResponse.json({ error: "Enter a question." }, { status: 400 });
  }
  if (questionText.trim().length > 500) {
    return NextResponse.json({ error: "Keep questions under 500 characters." }, { status: 400 });
  }

  if (!(await checkRateLimit(`hub-question:token:${token}`, 10, 10 * 60))) {
    return rateLimitedResponse();
  }

  const admin = createAdminClient();
  const member = await verifyHubMember(admin, { slug, eventId, token });
  if (!member) return NextResponse.json({ error: "This link isn't valid — check your confirmation email for the right one." }, { status: 403 });

  if (sessionId) {
    const { data: session } = await admin.from("event_sessions").select("qa_open").eq("id", sessionId).eq("event_id", eventId).maybeSingle();
    if (!session) return NextResponse.json({ error: "This session couldn't be found." }, { status: 404 });
    if (!session.qa_open) return NextResponse.json({ error: "Q&A isn't open for this session yet." }, { status: 403 });
  }

  const { error: insertError } = await admin.from("event_questions").insert({
    organization_id: member.organizationId,
    event_id: eventId,
    session_id: sessionId || null,
    speaker_id: speakerId || null,
    asked_by_member_id: member.memberId,
    asked_by_name: member.fullName,
    question_text: questionText.trim(),
  });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
