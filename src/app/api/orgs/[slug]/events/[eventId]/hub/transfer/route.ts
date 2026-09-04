import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyHubMember } from "@/lib/event-hub";
import { getEventStatus } from "@/lib/capture-window";
import { sendRegistrationEmail, sendVirtualConfirmationEmail, sendTicketTransferredAwayEmail } from "@/lib/registration-email";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";

type Body = { token?: string; fullName?: string; email?: string; phone?: string };

/**
 * Attendee-initiated ticket transfer, from the Event Hub — reassigns the SAME
 * registration/lead row (same reference_id/QR for a physical event, same join
 * link for virtual) to a new name/email rather than creating a new one and
 * cancelling the old, so anything already tied to it (check-in state, ticket
 * type, custom answers) carries over untouched. The event_hub_members row is
 * updated in place too, keeping the same hub_token — the trade-off is that the
 * outgoing attendee's own Hub link, if they still have it open, now reflects
 * the new attendee's identity rather than being revoked outright; there's no
 * per-token revocation in this schema to do better than that today.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/hub/transfer">) {
  const { slug, eventId } = await ctx.params;
  const body = (await request.json().catch(() => null)) as Body | null;
  const token = body?.token;
  const newFullName = body?.fullName?.trim();
  const newEmail = body?.email?.trim().toLowerCase();
  const newPhone = body?.phone?.trim();
  if (!token || !newFullName || !newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return NextResponse.json({ error: "Enter the new attendee's name and a valid email." }, { status: 400 });
  }

  if (!(await checkRateLimit(`hub-transfer:token:${token}`, 10, 10 * 60))) {
    return rateLimitedResponse();
  }
  if (!(await checkRateLimit(`hub-transfer:ip:${clientIp(request)}`, 30, 10 * 60))) {
    return rateLimitedResponse();
  }

  const admin = createAdminClient();
  const member = await verifyHubMember(admin, { slug, eventId, token });
  if (!member) return NextResponse.json({ error: "This link isn't valid — check your confirmation email for the right one." }, { status: 403 });

  const { data: event } = await admin
    .from("events")
    .select("id, name, date, end_date, start_time, end_time, timezone, event_format, virtual_join_url, virtual_platform, virtual_access_notes, venue, location")
    .eq("id", eventId)
    .eq("organization_id", member.organizationId)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });

  const status = getEventStatus({ date: event.date, endDate: event.end_date ?? undefined, startTime: event.start_time ?? undefined, endTime: event.end_time ?? undefined, timezone: event.timezone ?? undefined });
  if (status === "completed") return NextResponse.json({ error: "This event has already ended." }, { status: 403 });

  if (newEmail === member.email.toLowerCase()) {
    return NextResponse.json({ error: "That's already your own email." }, { status: 400 });
  }

  let emailSent: boolean;
  if (event.event_format === "virtual") {
    const { data: lead } = await admin.from("leads").select("id, status").eq("event_id", eventId).eq("organization_id", member.organizationId).ilike("email", member.email).maybeSingle();
    if (!lead) return NextResponse.json({ error: "We couldn't find your registration for this event." }, { status: 404 });
    if (lead.status !== "registered") return NextResponse.json({ error: "This ticket isn't in a transferable state." }, { status: 400 });

    const [firstName, ...rest] = newFullName.split(" ");
    const { error } = await admin
      .from("leads")
      .update({ first_name: firstName || newFullName, last_name: rest.join(" "), email: newEmail, phone: newPhone || "" })
      .eq("id", lead.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await sendTicketTransferredAwayEmail(member.email, event, newFullName);
    emailSent = await sendVirtualConfirmationEmail(newEmail, event);
  } else {
    const { data: registration } = await admin
      .from("registrations")
      .select("id, status, reference_id")
      .eq("event_id", eventId)
      .eq("organization_id", member.organizationId)
      .ilike("email", member.email)
      .maybeSingle();
    if (!registration) return NextResponse.json({ error: "We couldn't find your registration for this event." }, { status: 404 });
    if (registration.status === "checked_in") return NextResponse.json({ error: "This ticket has already been used to check in and can't be transferred." }, { status: 400 });
    if (registration.status !== "registered") return NextResponse.json({ error: "This ticket isn't in a transferable state." }, { status: 400 });

    const { error } = await admin.from("registrations").update({ full_name: newFullName, email: newEmail, phone: newPhone || null }).eq("id", registration.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await sendTicketTransferredAwayEmail(member.email, event, newFullName);
    emailSent = await sendRegistrationEmail(newEmail, registration.reference_id, event);
  }

  await admin.from("event_hub_members").update({ full_name: newFullName, email: newEmail }).eq("id", member.memberId);

  return NextResponse.json({ success: true, emailSent });
}
