import { NextResponse } from "next/server";
import { optionalPhone } from "@/lib/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyHubMember, hubUrl as buildHubUrl } from "@/lib/event-hub";
import { generateReferenceId, newId } from "@/lib/utils";
import { getEventStatus } from "@/lib/capture-window";
import { sendRegistrationEmail, sendVirtualConfirmationEmail, sendTicketTransferredAwayEmail } from "@/lib/registration-email";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";

type Body = { token?: string; fullName?: string; email?: string; phone?: string };

/**
 * Attendee-initiated ticket transfer, from the Event Hub — reassigns the SAME
 * registration/lead row to a new name/email rather than creating a new one and
 * cancelling the old, so anything already tied to it (check-in state, ticket
 * type, custom answers) carries over untouched.
 *
 * The ticket's credentials are replaced, not carried over: a new reference_id
 * (QR) and a new hub_token. Keeping them let the seller screenshot the QR and
 * still get in first, or keep the old Hub link and transfer the ticket again
 * after selling it. The old QR and Hub link stop working the moment this runs.
 * (A virtual event's join link is the event's own, shared by every attendee,
 * so it can't be revoked per ticket.)
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/hub/transfer">) {
  const { slug, eventId: eventParam } = await ctx.params;
  const body = (await request.json().catch(() => null)) as Body | null;
  const token = body?.token;
  const newFullName = body?.fullName?.trim();
  const newEmail = body?.email?.trim().toLowerCase();
  const newPhone = body?.phone?.trim();
  if (!token || !newFullName || !newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return NextResponse.json({ error: "Enter the new attendee's name and a valid email." }, { status: 400 });
  }
  const phoneCheck = optionalPhone(newPhone);
  if (!phoneCheck.ok) return NextResponse.json({ error: phoneCheck.error }, { status: 400 });

  if (!(await checkRateLimit(`hub-transfer:token:${token}`, 10, 10 * 60))) {
    return rateLimitedResponse();
  }
  if (!(await checkRateLimit(`hub-transfer:ip:${clientIp(request)}`, 30, 10 * 60))) {
    return rateLimitedResponse();
  }

  const admin = createAdminClient();
  const member = await verifyHubMember(admin, { slug, eventId: eventParam, token });
  if (!member) return NextResponse.json({ error: "This link isn't valid — check your confirmation email for the right one." }, { status: 403 });
  // the resolved event id (hub links may use the event's slug instead)
  const eventId = member.eventId;

  const { data: event } = await admin
    .from("events")
    .select("id, slug, name, date, end_date, start_time, end_time, timezone, event_format, virtual_join_url, virtual_platform, virtual_access_notes, venue, location")
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
  let transferredReferenceId: string | null = null;
  if (event.event_format === "virtual") {
    const { data: lead } = await admin.from("leads").select("id, status").eq("event_id", eventId).eq("organization_id", member.organizationId).ilike("email", member.email).maybeSingle();
    if (!lead) return NextResponse.json({ error: "We couldn't find your registration for this event." }, { status: 404 });
    if (lead.status !== "registered") return NextResponse.json({ error: "This ticket isn't in a transferable state." }, { status: 400 });

    const [firstName, ...rest] = newFullName.split(" ");
    const { error } = await admin
      .from("leads")
      .update({ first_name: firstName || newFullName, last_name: rest.join(" "), email: newEmail, phone: phoneCheck.value || "" })
      .eq("id", lead.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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

    // a fresh ticket code; retried on the (unlikely) clash with another ticket's
    let referenceId = "";
    let updateError: { message: string; code?: string } | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      referenceId = generateReferenceId();
      const { error } = await admin
        .from("registrations")
        .update({ full_name: newFullName, email: newEmail, phone: phoneCheck.value, reference_id: referenceId })
        .eq("id", registration.id)
        .eq("status", "registered");
      updateError = error;
      if (!error || error.code !== "23505") break;
    }
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    transferredReferenceId = referenceId;
  }

  const hubToken = newId("hub");
  await admin.from("event_hub_members").update({ full_name: newFullName, email: newEmail, hub_token: hubToken }).eq("id", member.memberId);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const newHubUrl = buildHubUrl(siteUrl, slug, { id: event.id, slug: event.slug }, hubToken);

  await sendTicketTransferredAwayEmail(member.email, event, newFullName);
  emailSent =
    event.event_format === "virtual"
      ? await sendVirtualConfirmationEmail(newEmail, event, newHubUrl)
      : await sendRegistrationEmail(newEmail, transferredReferenceId!, event, newHubUrl);

  return NextResponse.json({ success: true, emailSent });
}
