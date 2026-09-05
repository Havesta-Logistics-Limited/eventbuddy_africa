import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyHubMember } from "@/lib/event-hub";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";
import { getEventStatus } from "@/lib/capture-window";

/**
 * Attendee-facing read for the Event Hub — no session, the unguessable hub_token
 * mailed at registration IS the trust boundary, same model as a registration's
 * reference_id. Never exposes pending/hidden questions, draft polls, or any other
 * attendee's PII from event_hub_members — only what's meant to be visible to the
 * whole room, plus this specific member's own upvote/vote/bookmark state.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/hub">) {
  const { slug, eventId } = await ctx.params;
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing access token." }, { status: 400 });

  // The page polls this every 20s while open (plus an immediate refresh after
  // the attendee's own actions) — generous enough for that, but still bounded,
  // matching every sibling hub route's per-token throttle.
  if (!(await checkRateLimit(`hub-get:token:${token}`, 120, 10 * 60))) {
    return rateLimitedResponse();
  }
  if (!(await checkRateLimit(`hub-get:ip:${clientIp(request)}`, 300, 10 * 60))) {
    return rateLimitedResponse();
  }

  const admin = createAdminClient();
  const member = await verifyHubMember(admin, { slug, eventId, token });
  if (!member) return NextResponse.json({ error: "This link isn't valid — check your confirmation email for the right one." }, { status: 403 });

  const { data: event } = await admin
    .from("events")
    .select("id, name, date, end_date, start_time, end_time, timezone, event_format, survey_enabled, survey_fields")
    .eq("id", eventId)
    .eq("organization_id", member.organizationId)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });

  const [sessionRes, speakerRes, sessionSpeakerRes, questionRes, announcementRes, pollRes, pollOptionRes, myUpvoteRes, myVoteRes, myBookmarkRes, mySurveyResponseRes] = await Promise.all([
    admin.from("event_sessions").select("*").eq("event_id", eventId).order("start_time", { ascending: true }),
    admin.from("event_speakers").select("*").eq("event_id", eventId),
    admin.from("event_session_speakers").select("*"),
    admin.from("event_questions").select("*").eq("event_id", eventId).in("status", ["approved", "answered"]).order("upvote_count", { ascending: false }),
    admin.from("event_announcements").select("*").eq("event_id", eventId).order("pinned", { ascending: false }).order("created_at", { ascending: false }),
    admin.from("event_polls").select("*").eq("event_id", eventId).in("status", ["open", "closed"]).order("created_at", { ascending: false }),
    admin.from("event_poll_options").select("*").order("position", { ascending: true }),
    admin.from("event_question_upvotes").select("question_id").eq("hub_member_id", member.memberId),
    admin.from("event_poll_votes").select("poll_id, option_id").eq("hub_member_id", member.memberId),
    admin.from("event_agenda_bookmarks").select("session_id").eq("hub_member_id", member.memberId),
    admin.from("event_survey_responses").select("id").eq("event_id", eventId).eq("hub_member_id", member.memberId).maybeSingle(),
  ]);

  const speakersById = new Map((speakerRes.data ?? []).map((s) => [s.id, s]));
  const sessionIds = new Set((sessionRes.data ?? []).map((s) => s.id));
  const speakersBySession = new Map<string, { assignmentId: string; speakerId: string; name: string; photoUrl: string | null; role: string }[]>();
  for (const link of sessionSpeakerRes.data ?? []) {
    if (!sessionIds.has(link.session_id)) continue;
    const speaker = speakersById.get(link.speaker_id);
    if (!speaker) continue;
    const arr = speakersBySession.get(link.session_id) ?? [];
    arr.push({ assignmentId: link.id, speakerId: link.speaker_id, name: speaker.name, photoUrl: speaker.photo_url, role: link.role });
    speakersBySession.set(link.session_id, arr);
  }

  const myUpvotedQuestionIds = new Set((myUpvoteRes.data ?? []).map((r) => r.question_id));
  const myVoteByPoll = new Map((myVoteRes.data ?? []).map((r) => [r.poll_id, r.option_id]));
  const myBookmarkedSessionIds = new Set((myBookmarkRes.data ?? []).map((r) => r.session_id));

  const optionsByPoll = new Map<string, { id: string; label: string; vote_count: number }[]>();
  for (const o of pollOptionRes.data ?? []) {
    const arr = optionsByPoll.get(o.poll_id) ?? [];
    arr.push(o);
    optionsByPoll.set(o.poll_id, arr);
  }

  const eventStatus = getEventStatus({
    date: event.date,
    endDate: event.end_date ?? undefined,
    startTime: event.start_time ?? undefined,
    endTime: event.end_time ?? undefined,
    timezone: event.timezone ?? undefined,
  });

  return NextResponse.json({
    event: { id: event.id, name: event.name, date: event.date, eventFormat: event.event_format },
    attendeeName: member.fullName,
    attendeeEmail: member.email,
    canTransferTicket: eventStatus !== "completed",
    survey:
      event.survey_enabled && eventStatus === "completed"
        ? { fields: event.survey_fields ?? [], alreadySubmitted: !!mySurveyResponseRes.data }
        : null,
    sessions: (sessionRes.data ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      startTime: s.start_time,
      endTime: s.end_time,
      track: s.track,
      sessionType: s.session_type,
      qaOpen: s.qa_open,
      speakers: speakersBySession.get(s.id) ?? [],
      bookmarked: myBookmarkedSessionIds.has(s.id),
    })),
    speakers: (speakerRes.data ?? []).map((s) => ({ id: s.id, name: s.name, title: s.title, company: s.company, bio: s.bio, photoUrl: s.photo_url })),
    questions: (questionRes.data ?? []).map((q) => ({
      id: q.id,
      sessionId: q.session_id,
      speakerId: q.speaker_id,
      askedByName: q.asked_by_name,
      questionText: q.question_text,
      status: q.status,
      upvoteCount: q.upvote_count,
      hasUpvoted: myUpvotedQuestionIds.has(q.id),
      createdAt: q.created_at,
    })),
    announcements: (announcementRes.data ?? []).map((a) => ({ id: a.id, body: a.body, pinned: a.pinned, createdAt: a.created_at })),
    polls: (pollRes.data ?? []).map((p) => ({
      id: p.id,
      question: p.question,
      status: p.status,
      myOptionId: myVoteByPoll.get(p.id) ?? null,
      options: (optionsByPoll.get(p.id) ?? []).map((o) => ({ id: o.id, label: o.label, voteCount: o.vote_count })),
    })),
  });
}
