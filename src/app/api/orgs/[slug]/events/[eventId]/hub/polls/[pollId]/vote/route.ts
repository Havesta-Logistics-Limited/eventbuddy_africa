import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyHubMember } from "@/lib/event-hub";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

type Body = { token: string; optionId: string };

/**
 * Casts (or changes) this attendee's vote on a poll — deletes any existing vote by
 * this member first, then inserts the new one, so voting again simply changes the
 * answer rather than erroring on the unique(poll_id, hub_member_id) constraint.
 * vote_count on each option stays in sync via a database trigger, not incremented
 * here.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/hub/polls/[pollId]/vote">) {
  const { slug, eventId, pollId } = await ctx.params;
  const body = (await request.json()) as Partial<Body>;
  if (!body.token || !body.optionId) return NextResponse.json({ error: "Missing required fields." }, { status: 400 });

  if (!(await checkRateLimit(`hub-poll-vote:token:${body.token}`, 20, 60))) {
    return rateLimitedResponse();
  }

  const admin = createAdminClient();
  const member = await verifyHubMember(admin, { slug, eventId, token: body.token });
  if (!member) return NextResponse.json({ error: "This link isn't valid — check your confirmation email for the right one." }, { status: 403 });

  const { data: poll } = await admin.from("event_polls").select("status").eq("id", pollId).eq("event_id", eventId).maybeSingle();
  if (!poll) return NextResponse.json({ error: "This poll couldn't be found." }, { status: 404 });
  if (poll.status !== "open") return NextResponse.json({ error: "This poll isn't open for voting." }, { status: 403 });

  const { data: option } = await admin.from("event_poll_options").select("id").eq("id", body.optionId).eq("poll_id", pollId).maybeSingle();
  if (!option) return NextResponse.json({ error: "This option couldn't be found." }, { status: 404 });

  await admin.from("event_poll_votes").delete().eq("poll_id", pollId).eq("hub_member_id", member.memberId);
  const { error } = await admin.from("event_poll_votes").insert({ poll_id: pollId, option_id: body.optionId, hub_member_id: member.memberId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
