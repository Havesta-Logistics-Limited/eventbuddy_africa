import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { sendGuestInviteEmail } from "@/lib/guest-invite-email";
import { guestRsvpUrl } from "@/lib/event-guest";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

const BodySchema = z.object({ guestIds: z.array(z.string().uuid()).min(1).max(50) });

/**
 * Sends (or resends) the RSVP invite email to specific guests on this event.
 * Uses the RLS-respecting server client throughout, not the service-role
 * client — an org admin can only ever read/update event_guests rows RLS
 * already scopes to their own org, so there's no need for elevated access
 * here, only for the actual Resend send (which needs the server-only API key
 * regardless of which Supabase client reads the data).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/guests/invite">) {
  const { slug, eventId } = await ctx.params;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Select at least one guest." }, { status: 400 });
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!(await checkRateLimit(`guest-invite:user:${user.id}`, 20, 10 * 60))) {
    return rateLimitedResponse();
  }

  const { data: org } = await supabase.from("organizations").select("id, slug").eq("owner_user_id", user.id).ilike("slug", slug).maybeSingle();
  if (!org) return NextResponse.json({ error: "Not authorized for this organization." }, { status: 403 });

  const { data: event } = await supabase
    .from("events")
    .select("id, name, date, start_time, end_time, event_format, virtual_join_url, virtual_platform, virtual_access_notes, venue, location, is_invite_only")
    .eq("id", eventId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });
  if (!event.is_invite_only) return NextResponse.json({ error: "This event isn't set to invite-only." }, { status: 400 });

  const { data: guests } = await supabase.from("event_guests").select("id, full_name, email, invite_token").eq("event_id", eventId).in("id", parsed.data.guestIds);
  if (!guests || guests.length === 0) return NextResponse.json({ error: "No matching guests found." }, { status: 404 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const sentIds: string[] = [];
  let throttled = false;
  for (const guest of guests) {
    // Cumulative send-volume cap, separate from the request-count limit above —
    // caps total email volume per admin rather than just how often they can call
    // this route, since the per-request cap alone still allows a large batch.
    if (!(await checkRateLimit(`guest-invite-email:user:${user.id}`, 150, 10 * 60))) {
      throttled = true;
      break;
    }
    const rsvpUrl = guestRsvpUrl(siteUrl, org.slug, eventId, guest.invite_token);
    const sent = await sendGuestInviteEmail(guest.email, guest.full_name, event, rsvpUrl);
    if (sent) sentIds.push(guest.id);
  }

  if (sentIds.length > 0) {
    await supabase.from("event_guests").update({ invited_at: new Date().toISOString() }).in("id", sentIds);
  }

  return NextResponse.json({
    success: true,
    sentCount: sentIds.length,
    totalCount: guests.length,
    ...(throttled ? { error: "Sent as many invites as we could for now — you've hit the email volume limit. Try the rest again shortly." } : {}),
  });
}
