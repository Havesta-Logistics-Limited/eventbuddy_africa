import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyHubMember } from "@/lib/event-hub";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

type Body = { token: string };

/**
 * Toggles this attendee's upvote on a question — one vote per hub member, enforced
 * by event_question_upvotes' unique(question_id, hub_member_id) constraint, and
 * upvote_count on the question stays in sync via a database trigger rather than
 * being incremented here, so it can never drift from the actual vote rows.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/hub/questions/[questionId]/upvote">) {
  const { slug, eventId, questionId } = await ctx.params;
  const body = (await request.json()) as Partial<Body>;
  if (!body.token) return NextResponse.json({ error: "Missing access token." }, { status: 400 });

  if (!(await checkRateLimit(`hub-upvote:token:${body.token}`, 30, 60))) {
    return rateLimitedResponse();
  }

  const admin = createAdminClient();
  const member = await verifyHubMember(admin, { slug, eventId, token: body.token });
  if (!member) return NextResponse.json({ error: "This link isn't valid — check your confirmation email for the right one." }, { status: 403 });

  const { data: question } = await admin.from("event_questions").select("id").eq("id", questionId).eq("event_id", eventId).maybeSingle();
  if (!question) return NextResponse.json({ error: "This question couldn't be found." }, { status: 404 });

  const { data: existing } = await admin
    .from("event_question_upvotes")
    .select("id")
    .eq("question_id", questionId)
    .eq("hub_member_id", member.memberId)
    .maybeSingle();

  if (existing) {
    const { error } = await admin.from("event_question_upvotes").delete().eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, upvoted: false });
  }

  const { error } = await admin.from("event_question_upvotes").insert({ question_id: questionId, hub_member_id: member.memberId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, upvoted: true });
}
