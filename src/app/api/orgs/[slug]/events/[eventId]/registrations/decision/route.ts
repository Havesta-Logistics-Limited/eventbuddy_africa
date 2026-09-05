import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureHubMember, hubUrl as buildHubUrl } from "@/lib/event-hub";
import { sendRegistrationEmail, sendVirtualConfirmationEmail, sendDeclinedEmail } from "@/lib/registration-email";
import { incrementTicketQuantitySold, decrementTicketQuantitySold } from "@/lib/ticket-capacity";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

type Body = {
  id?: string;
  /** registrations rows back physical events, leads rows back virtual events — see
   *  the event_format branch in /api/orgs/[slug]/register. */
  kind?: "registration" | "lead";
  action?: "approve" | "decline" | "promote";
};

/**
 * Organizer-triggered transitions for a pending or waitlisted attendee:
 *  - approve:  pending    -> registered  (seat was already reserved at signup time)
 *  - decline:  pending/waitlisted -> declined (frees the seat if one was reserved)
 *  - promote:  waitlisted -> registered  (reserves a seat now — can fail if the
 *              event has genuinely filled up since, which is surfaced honestly
 *              rather than overselling)
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/registrations/decision">) {
  const { slug, eventId } = await ctx.params;
  const body = (await request.json().catch(() => null)) as Body | null;
  const { id, kind, action } = body ?? {};
  if (!id || (kind !== "registration" && kind !== "lead") || !action || !["approve", "decline", "promote"].includes(action)) {
    return NextResponse.json({ error: "Missing or invalid fields." }, { status: 400 });
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!(await checkRateLimit(`registrations-decision:user:${user.id}`, 60, 10 * 60))) {
    return rateLimitedResponse();
  }

  const { data: org } = await supabase.from("organizations").select("id, slug").eq("owner_user_id", user.id).ilike("slug", slug).maybeSingle();
  if (!org) return NextResponse.json({ error: "Not authorized for this organization." }, { status: 403 });

  const { data: event } = await supabase
    .from("events")
    .select("id, slug, name, date, start_time, end_time, event_format, virtual_join_url, virtual_platform, virtual_access_notes, venue, location")
    .eq("id", eventId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });

  const admin = createAdminClient();
  const table = kind === "registration" ? "registrations" : "leads";
  const selectCols = kind === "registration" ? "id, email, full_name, reference_id, status, ticket_type_id" : "id, email, first_name, last_name, status, ticket_type_id";

  const { data: row } = await admin.from(table).select(selectCols).eq("id", id).eq("event_id", event.id).eq("organization_id", org.id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Registration not found." }, { status: 404 });

  const fullName = kind === "registration" ? (row as { full_name: string }).full_name : `${(row as { first_name: string }).first_name} ${(row as { last_name: string }).last_name}`;
  const email = row.email as string;
  const ticketTypeId = row.ticket_type_id as string | null;
  const currentStatus = row.status as string;

  if (action === "approve" && currentStatus !== "pending") {
    return NextResponse.json({ error: "Only a pending registration can be approved." }, { status: 400 });
  }
  if (action === "decline" && currentStatus !== "pending" && currentStatus !== "waitlisted") {
    return NextResponse.json({ error: "Only a pending or waitlisted registration can be declined." }, { status: 400 });
  }
  if (action === "promote" && currentStatus !== "waitlisted") {
    return NextResponse.json({ error: "Only a waitlisted registration can be promoted." }, { status: 400 });
  }

  if (action === "decline") {
    // A pending registration already holds a reserved seat (reserved at signup);
    // a waitlisted one never did, so there's nothing to free in that case.
    if (currentStatus === "pending" && ticketTypeId) await decrementTicketQuantitySold(admin, ticketTypeId);
    const { error } = await admin.from(table).update({ status: "declined" }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const emailSent = await sendDeclinedEmail(email, event);
    return NextResponse.json({ success: true, status: "declined", emailSent });
  }

  if (action === "promote" && ticketTypeId) {
    const gotSeat = await incrementTicketQuantitySold(admin, ticketTypeId);
    if (!gotSeat) return NextResponse.json({ error: "No seats are available right now — the event has filled up." }, { status: 409 });
  }

  // approve, or promote with a seat now reserved (or no ticket type to reserve)
  const { error } = await admin.from(table).update({ status: "registered" }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  let hub: string | undefined;
  try {
    const { hubToken } = await ensureHubMember(admin, { organizationId: org.id, eventId: event.id, email, fullName });
    hub = buildHubUrl(siteUrl, org.slug, event, hubToken);
  } catch {
    hub = undefined;
  }

  const emailSent =
    event.event_format === "virtual"
      ? await sendVirtualConfirmationEmail(email, event, hub)
      : await sendRegistrationEmail(email, (row as { reference_id: string }).reference_id, event, hub);

  return NextResponse.json({ success: true, status: "registered", emailSent, hubUrl: hub });
}
