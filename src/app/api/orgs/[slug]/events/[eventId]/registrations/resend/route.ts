import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureHubMember, hubUrl as buildHubUrl } from "@/lib/event-hub";
import { resolveOrgAccess } from "@/lib/org-access";
import { sendRegistrationEmail } from "@/lib/registration-email";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

type Body = { registrationId?: string };

/**
 * Resends the original confirmation email (reference ID + QR code) to one
 * registrant, or every active registrant on the event when registrationId is
 * omitted — for the "a few days before the event" nudge, or an attendee
 * saying they never got theirs. Cancelled registrations are skipped either
 * way; there's nothing to resend them. The `registrations` table only ever
 * holds physical-event attendees (virtual events register via `leads`
 * instead — see finalizePaystackTransaction/register's own event_format
 * branch), so this always sends the QR-code email, never the virtual one.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/registrations/resend">) {
  const { slug, eventId } = await ctx.params;
  const body = (await request.json().catch(() => null)) as Partial<Body> | null;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!(await checkRateLimit(`registrations-resend:user:${user.id}`, 15, 10 * 60))) {
    return rateLimitedResponse();
  }

  const org = await resolveOrgAccess(supabase, user.id, slug);
  if (!org) return NextResponse.json({ error: "Not authorized for this organization." }, { status: 403 });
  if (org.role === "event_support" && org.eventId !== eventId) {
    return NextResponse.json({ error: "Not authorized for this event." }, { status: 403 });
  }

  const { data: event } = await supabase
    .from("events")
    .select("id, slug, name, date, start_time, end_time, event_format, virtual_join_url, virtual_platform, virtual_access_notes, venue, location")
    .eq("id", eventId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });

  const admin = createAdminClient();
  let registrationsQuery = admin
    .from("registrations")
    .select("id, email, full_name, reference_id")
    .eq("event_id", event.id)
    .eq("organization_id", org.id)
    .neq("status", "cancelled");
  if (body?.registrationId) registrationsQuery = registrationsQuery.eq("id", body.registrationId);

  const { data: registrations } = await registrationsQuery;
  if (!registrations || registrations.length === 0) {
    return NextResponse.json({ error: "No matching registration found." }, { status: 404 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  let sentCount = 0;
  for (const reg of registrations) {
    let hub: string | undefined;
    try {
      const { hubToken } = await ensureHubMember(admin, { organizationId: org.id, eventId: event.id, email: reg.email, fullName: reg.full_name });
      hub = buildHubUrl(siteUrl, org.slug, event, hubToken);
    } catch {
      hub = undefined;
    }
    const sent = await sendRegistrationEmail(reg.email, reg.reference_id, event, hub);
    if (sent) sentCount++;
  }

  return NextResponse.json({ success: true, sentCount, totalCount: registrations.length });
}
