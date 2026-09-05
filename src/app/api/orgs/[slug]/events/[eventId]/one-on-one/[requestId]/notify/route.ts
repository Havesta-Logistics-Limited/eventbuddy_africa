import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOneOnOneAssignmentNotification } from "@/lib/registration-email";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { resolveOrgAccess } from "@/lib/org-access";

/**
 * Organizer-triggered — tells one attendee their 1-on-1 assignment by email.
 * Requires a real session (same cookie-auth + ownership check as
 * .../registrations/resend), since this sends mail on the organizer's behalf and
 * must never fire from the public request-submission route. Requires an
 * assignment to already be set — there's nothing to tell the attendee otherwise.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/one-on-one/[requestId]/notify">) {
  const { slug, eventId, requestId } = await ctx.params;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!(await checkRateLimit(`one-on-one-notify:user:${user.id}`, 30, 10 * 60))) {
    return rateLimitedResponse();
  }

  const org = await resolveOrgAccess(supabase, user.id, slug);
  if (!org) return NextResponse.json({ error: "Not authorized for this organization." }, { status: 403 });
  if (org.role === "event_support" && org.eventId !== eventId) {
    return NextResponse.json({ error: "Not authorized for this event." }, { status: 403 });
  }

  const { data: event } = await supabase.from("events").select("id, name").eq("id", eventId).eq("organization_id", org.id).maybeSingle();
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });

  const admin = createAdminClient();
  const { data: oneOnOneRequest } = await admin
    .from("event_one_on_one_requests")
    .select("id, email, assignment")
    .eq("id", requestId)
    .eq("event_id", event.id)
    .maybeSingle();
  if (!oneOnOneRequest) return NextResponse.json({ error: "This request couldn't be found." }, { status: 404 });
  if (!oneOnOneRequest.assignment?.trim()) {
    return NextResponse.json({ error: "Set an assignment before notifying the attendee." }, { status: 400 });
  }

  const emailSent = await sendOneOnOneAssignmentNotification(oneOnOneRequest.email, event.name, oneOnOneRequest.assignment);
  if (!emailSent) return NextResponse.json({ error: "Couldn't send the email. Please try again." }, { status: 500 });

  const notifiedAt = new Date().toISOString();
  await admin.from("event_one_on_one_requests").update({ notified_at: notifiedAt }).eq("id", requestId);

  return NextResponse.json({ success: true, notifiedAt });
}
