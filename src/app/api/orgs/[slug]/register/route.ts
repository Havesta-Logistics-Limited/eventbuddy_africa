import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRegistrationGate, windowFromEvent } from "@/lib/capture-window";
import { generateReferenceId } from "@/lib/utils";
import { sendRegistrationEmail, sendVirtualConfirmationEmail, sendPendingApprovalEmail, sendWaitlistEmail } from "@/lib/registration-email";
import { sendPushToAttendee } from "@/lib/push";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";
import { ensureHubMember, hubUrl as buildHubUrl } from "@/lib/event-hub";
import { incrementTicketQuantitySold, decrementTicketQuantitySold } from "@/lib/ticket-capacity";

type RegisterBody = {
  eventId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  customAnswers?: Record<string, string | string[]>;
  /** Set when the event has ticket types and the attendee picked a free one — a paid
   *  ticket must never reach this route; the register page instead calls
   *  /api/orgs/[slug]/ticket-purchase/initialize, and a registration only gets created
   *  once that payment actually succeeds (see finalizePaystackTransaction). */
  ticketTypeId?: string;
  /** Which surface this registration came from — the web register page doesn't send
   *  this at all (defaults to "web" below), only the mobile app does. Purely for
   *  /platform's mobile-vs-web reporting; doesn't affect any registration logic. */
  source?: "web" | "mobile";
  /** "Don't show my name publicly" checkbox on the registration form — keeps the
   *  attendee out of the public "N Going" name sample (they still count toward the
   *  aggregate number). See public_event_attendee_summary in 0061. */
  hideFromGuestList?: boolean;
};

/**
 * Self-service attendee registration — no session, anyone with the event's public link
 * can post here. Modeled on /api/leads and staff-checkin: the service-role client
 * bypasses RLS, so this route itself is the trust boundary — it resolves and validates
 * the event server-side rather than trusting anything else the client sends.
 *
 * Physical events create a `registrations` row (reference ID + QR) for staff to check
 * in at the venue. Virtual events have no physical check-in, so registering there
 * writes straight to `leads` instead — self-service registration IS the lead capture.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/register">) {
  const { slug } = await ctx.params;
  const body = (await request.json()) as Partial<RegisterBody>;
  const { eventId, firstName, lastName, email, phone, customAnswers, ticketTypeId, source, hideFromGuestList } = body;
  const resolvedSource = source === "mobile" ? "mobile" : "web";

  if (!eventId || !firstName?.trim() || !lastName?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  // Generous enough for a real rush of attendees registering for the same popular
  // event from behind one shared IP (a campus, an office), but stops a script from
  // mass-registering fake attendees to exhaust a limited-capacity free ticket.
  if (!(await checkRateLimit(`register:ip:${clientIp(request)}`, 20, 10 * 60))) {
    return rateLimitedResponse();
  }

  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || apiKey === "paste_your_supabase_service_role_key_here") {
    return NextResponse.json({ error: "Not configured yet." }, { status: 500 });
  }

  const supabase = createAdminClient();

  const { data: org } = await supabase.from("organizations").select("id, is_suspended").ilike("slug", slug).maybeSingle();
  if (!org) return NextResponse.json({ error: "No organization found for that link." }, { status: 404 });
  if (org.is_suspended) return NextResponse.json({ error: "Registration is unavailable for this event right now." }, { status: 403 });

  const { data: event } = await supabase
    .from("events")
    .select(
      "id, name, date, end_date, start_time, end_time, timezone, capture_override, event_format, virtual_join_url, virtual_platform, virtual_access_notes, venue, location, self_registration_enabled, published, requires_approval, waitlist_enabled"
    )
    .eq("id", eventId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });
  if (!event.published) return NextResponse.json({ error: "This event isn't live yet." }, { status: 403 });
  if (event.event_format !== "virtual" && event.self_registration_enabled === false) {
    return NextResponse.json({ error: "Registration isn't available for this event." }, { status: 403 });
  }

  const gate = getRegistrationGate(
    windowFromEvent({ date: event.date, endDate: event.end_date ?? undefined, startTime: event.start_time ?? undefined, endTime: event.end_time ?? undefined }),
    event.timezone ?? undefined,
    event.capture_override ?? undefined
  );
  if (!gate.open) {
    const message =
      gate.reason === "manually_closed" ? "Registration has been closed by the event organizer." : `Registration has closed — it ended ${gate.closesAt.toLocaleString()}.`;
    return NextResponse.json({ error: message }, { status: 403 });
  }

  let ticketTypeIdForRegistration: string | null = null;
  if (ticketTypeId) {
    const { data: ticket } = await supabase.from("ticket_types").select("id, price_naira").eq("id", ticketTypeId).eq("event_id", event.id).maybeSingle();
    if (!ticket) return NextResponse.json({ error: "This ticket type couldn't be found." }, { status: 404 });
    if (Number(ticket.price_naira) > 0) {
      return NextResponse.json({ error: "This ticket requires payment — please use the payment link instead." }, { status: 400 });
    }
    ticketTypeIdForRegistration = ticket.id;
  }

  // Reserve the seat (if this ticket type is capacity-limited) before creating any
  // row — this is what actually fixes the pre-existing oversell bug: the old code
  // incremented after inserting and only logged a failure, so a sold-out free ticket
  // could still be registered. Now a failed reservation either falls back to the
  // waitlist or rejects outright, and never creates a phantom "registered" row.
  let resolvedStatus: "registered" | "pending" | "waitlisted";
  let seatReserved = false;
  if (ticketTypeIdForRegistration) {
    seatReserved = await incrementTicketQuantitySold(supabase, ticketTypeIdForRegistration);
    if (seatReserved) {
      resolvedStatus = event.requires_approval ? "pending" : "registered";
    } else if (event.waitlist_enabled) {
      resolvedStatus = "waitlisted";
    } else {
      return NextResponse.json({ error: "This ticket is sold out." }, { status: 409 });
    }
  } else {
    resolvedStatus = event.requires_approval ? "pending" : "registered";
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const resolvedOrgId = org.id;
  const resolvedEventId = event.id;

  /** Best-effort — a Hub-provisioning failure should never block registration
   *  itself; the confirmation email still sends everything the attendee actually
   *  needs (QR/reference or join link) even if this comes back undefined. */
  async function tryHubUrl(attendeeEmail: string, attendeeName: string): Promise<string | undefined> {
    try {
      const { hubToken } = await ensureHubMember(supabase, {
        organizationId: resolvedOrgId,
        eventId: resolvedEventId,
        email: attendeeEmail,
        fullName: attendeeName,
      });
      return buildHubUrl(siteUrl, slug, resolvedEventId, hubToken);
    } catch {
      return undefined;
    }
  }

  const responseEvent = {
    name: event.name,
    date: event.date,
    eventFormat: event.event_format ?? "physical",
    virtualJoinUrl: event.virtual_join_url ?? undefined,
    virtualPlatform: event.virtual_platform ?? undefined,
    virtualAccessNotes: event.virtual_access_notes ?? undefined,
    venue: event.venue,
    location: event.location,
  };

  if (event.event_format === "virtual") {
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .insert({
        organization_id: org.id,
        event_id: event.id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        phone: phone?.trim() || "",
        preferred_course: "",
        level_of_interest: "",
        start_year: "",
        highest_education: "",
        taken_ielts: "",
        comments: "",
        custom_answers: customAnswers || {},
        source: resolvedSource,
        status: resolvedStatus,
        ticket_type_id: ticketTypeIdForRegistration,
        hide_from_guest_list: Boolean(hideFromGuestList),
      })
      .select()
      .single();
    if (leadError || !lead) {
      if (seatReserved && ticketTypeIdForRegistration) await decrementTicketQuantitySold(supabase, ticketTypeIdForRegistration);
      return NextResponse.json({ error: leadError?.message || "Couldn't complete your registration." }, { status: 500 });
    }

    if (resolvedStatus === "pending") {
      const emailSent = await sendPendingApprovalEmail(lead.email, event);
      await sendPushToAttendee(supabase, lead.email, "Registration pending approval", `${event.name} — the organizer will confirm your spot soon.`, { eventId: event.id });
      return NextResponse.json({ success: true, status: resolvedStatus, emailSent, event: responseEvent });
    }
    if (resolvedStatus === "waitlisted") {
      const emailSent = await sendWaitlistEmail(lead.email, event);
      await sendPushToAttendee(supabase, lead.email, "You're on the waitlist", `${event.name} — we'll email you if a spot opens up.`, { eventId: event.id });
      return NextResponse.json({ success: true, status: resolvedStatus, emailSent, event: responseEvent });
    }

    const hub = await tryHubUrl(lead.email, `${firstName.trim()} ${lastName.trim()}`);
    const emailSent = await sendVirtualConfirmationEmail(lead.email, event, hub);
    await sendPushToAttendee(supabase, lead.email, "You're registered! 🎉", `${event.name} — check your email for join details.`, { eventId: event.id });
    return NextResponse.json({ success: true, status: resolvedStatus, emailSent, hubUrl: hub, event: responseEvent });
  }

  let registration = null;
  for (let attempt = 0; attempt < 5 && !registration; attempt++) {
    const { data, error } = await supabase
      .from("registrations")
      .insert({
        organization_id: org.id,
        event_id: event.id,
        reference_id: generateReferenceId(),
        ticket_type_id: ticketTypeIdForRegistration,
        full_name: `${firstName.trim()} ${lastName.trim()}`,
        email: email.trim(),
        phone: phone?.trim() || null,
        custom_answers: customAnswers || {},
        source: resolvedSource,
        status: resolvedStatus,
        hide_from_guest_list: Boolean(hideFromGuestList),
      })
      .select()
      .single();
    if (data) {
      registration = data;
    } else if (error?.code !== "23505") {
      if (seatReserved && ticketTypeIdForRegistration) await decrementTicketQuantitySold(supabase, ticketTypeIdForRegistration);
      return NextResponse.json({ error: error?.message || "Couldn't complete your registration." }, { status: 500 });
    }
  }
  if (!registration) {
    if (seatReserved && ticketTypeIdForRegistration) await decrementTicketQuantitySold(supabase, ticketTypeIdForRegistration);
    return NextResponse.json({ error: "Couldn't complete your registration. Please try again." }, { status: 500 });
  }

  if (resolvedStatus === "pending") {
    const emailSent = await sendPendingApprovalEmail(registration.email, event);
    await sendPushToAttendee(supabase, registration.email, "Registration pending approval", `${event.name} — the organizer will confirm your spot soon.`, { eventId: event.id });
    return NextResponse.json({ success: true, status: resolvedStatus, referenceId: registration.reference_id, emailSent, event: responseEvent });
  }
  if (resolvedStatus === "waitlisted") {
    const emailSent = await sendWaitlistEmail(registration.email, event);
    await sendPushToAttendee(supabase, registration.email, "You're on the waitlist", `${event.name} — we'll email you if a spot opens up.`, { eventId: event.id });
    return NextResponse.json({ success: true, status: resolvedStatus, referenceId: registration.reference_id, emailSent, event: responseEvent });
  }

  const hub = await tryHubUrl(registration.email, registration.full_name);
  const emailSent = await sendRegistrationEmail(registration.email, registration.reference_id, event, hub);
  await sendPushToAttendee(supabase, registration.email, "You're registered! 🎉", `${event.name} — your ticket is ready.`, {
    eventId: event.id,
    referenceId: registration.reference_id,
  });

  return NextResponse.json({ success: true, status: resolvedStatus, referenceId: registration.reference_id, emailSent, hubUrl: hub, event: responseEvent });
}
