import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Attendee-facing read for the Event Hub — no session, the unguessable hub_token
 * mailed at registration IS the trust boundary, same model as a registration's
 * reference_id. Never exposes pending/hidden questions or any other attendee's PII
 * from event_hub_members — only what's meant to be visible to the whole room.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/hub">) {
  const { slug, eventId } = await ctx.params;
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing access token." }, { status: 400 });

  const admin = createAdminClient();

  const { data: org } = await admin.from("organizations").select("id").ilike("slug", slug).maybeSingle();
  if (!org) return NextResponse.json({ error: "No organization found for that link." }, { status: 404 });

  const { data: member } = await admin
    .from("event_hub_members")
    .select("id, full_name")
    .eq("event_id", eventId)
    .eq("organization_id", org.id)
    .eq("hub_token", token)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "This link isn't valid — check your confirmation email for the right one." }, { status: 403 });

  const { data: event } = await admin.from("events").select("id, name, date, event_format").eq("id", eventId).eq("organization_id", org.id).maybeSingle();
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });

  const [sessionRes, speakerRes, sessionSpeakerRes, questionRes, announcementRes] = await Promise.all([
    admin.from("event_sessions").select("*").eq("event_id", eventId).order("start_time", { ascending: true }),
    admin.from("event_speakers").select("*").eq("event_id", eventId),
    admin.from("event_session_speakers").select("*"),
    admin.from("event_questions").select("*").eq("event_id", eventId).in("status", ["approved", "answered"]).order("upvote_count", { ascending: false }),
    admin.from("event_announcements").select("*").eq("event_id", eventId).order("pinned", { ascending: false }).order("created_at", { ascending: false }),
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

  return NextResponse.json({
    event: { id: event.id, name: event.name, date: event.date, eventFormat: event.event_format },
    attendeeName: member.full_name,
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
      createdAt: q.created_at,
    })),
    announcements: (announcementRes.data ?? []).map((a) => ({ id: a.id, body: a.body, pinned: a.pinned, createdAt: a.created_at })),
  });
}
