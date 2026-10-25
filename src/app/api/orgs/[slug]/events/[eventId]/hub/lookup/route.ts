import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";
import { hasActiveTicket, resolveHubEvent, hubUrl as buildHubUrl } from "@/lib/event-hub";
import { resolveRouteUser } from "@/lib/supabase/route-auth";
import { sendHubLinkEmail } from "@/lib/registration-email";

type LookupBody = { email?: string; referenceId?: string };

/**
 * Resolves an attendee's own hub_token from something they'd actually remember —
 * their email, or (for a physical event) their reference ID — so a generic,
 * shareable per-event QR/link (no token baked in) can still get them into their
 * own Hub without digging up the original confirmation email. Backs the "Enter
 * your email or reference ID" fallback on the Hub page when it's opened without
 * a token.
 *
 * A reference ID is the attendee's own ticket code, so it opens the Hub
 * straight away. An email address proves nothing about who typed it: the Hub
 * link is emailed to that address instead, and the answer is the same whether
 * or not anyone is registered. A signed-in user (the mobile app sends its
 * session) looking up their own confirmed email gets the link directly.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/hub/lookup">) {
  const { slug, eventId } = await ctx.params;
  const body = (await request.json()) as Partial<LookupBody>;
  const email = body.email?.trim().toLowerCase();
  const referenceId = body.referenceId?.trim().toUpperCase();

  if (!email && !referenceId) {
    return NextResponse.json({ error: "Enter your email or reference ID." }, { status: 400 });
  }

  if (!(await checkRateLimit(`hub-lookup:ip:${clientIp(request)}`, 15, 10 * 60))) {
    return rateLimitedResponse();
  }
  // email lookups by someone not signed in as that email get the link by email
  let emailOnly = false;
  if (email && !referenceId) {
    const { user } = await resolveRouteUser(request);
    emailOnly = !(user?.email && user.email_confirmed_at && user.email.toLowerCase() === email);
    if (emailOnly && !(await checkRateLimit(`hub-lookup:email:${email}`, 3, 60 * 60))) return rateLimitedResponse();
  }
  const emailedResponse = () => NextResponse.json({ emailSent: true, message: "If you're registered for this event, we've emailed your Event Hub link. Check your inbox." });

  const admin = createAdminClient();
  // hub links use the event's id or its slug
  const event = await resolveHubEvent(admin, slug, eventId);
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });

  let resolvedEmail = email;
  if (!resolvedEmail && referenceId) {
    const { data: registration } = await admin.from("registrations").select("email").eq("event_id", event.eventId).eq("reference_id", referenceId).maybeSingle();
    if (!registration) {
      return NextResponse.json({ error: "We couldn't find a registration matching that reference ID for this event." }, { status: 404 });
    }
    resolvedEmail = registration.email.toLowerCase();
  }

  const { data: member } = await admin
    .from("event_hub_members")
    .select("hub_token")
    .eq("event_id", event.eventId)
    .eq("organization_id", event.organizationId)
    .ilike("email", resolvedEmail!)
    .maybeSingle();
  if (!member) {
    if (emailOnly) return emailedResponse();
    return NextResponse.json({ error: "We couldn't find a registration matching that for this event." }, { status: 404 });
  }
  if (!(await hasActiveTicket(admin, event.eventId, event.eventFormat, resolvedEmail!))) {
    if (emailOnly) return emailedResponse();
    return NextResponse.json({ error: "This ticket was cancelled or refunded, so its event hub is closed." }, { status: 403 });
  }

  if (emailOnly) {
    const [{ data: ev }, { data: org }] = await Promise.all([
      admin.from("events").select("id, slug, name").eq("id", event.eventId).single(),
      admin.from("organizations").select("slug").eq("id", event.organizationId).single(),
    ]);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    if (ev && org) await sendHubLinkEmail(resolvedEmail!, ev.name, buildHubUrl(siteUrl, org.slug, ev, member.hub_token));
    return emailedResponse();
  }
  return NextResponse.json({ token: member.hub_token });
}
