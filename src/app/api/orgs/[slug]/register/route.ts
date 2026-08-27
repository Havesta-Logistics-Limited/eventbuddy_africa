import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRegistrationGate, windowFromEvent } from "@/lib/capture-window";
import { generateReferenceId } from "@/lib/utils";
import { sendRegistrationEmail, sendVirtualConfirmationEmail } from "@/lib/registration-email";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";
import { ensureHubMember, hubUrl as buildHubUrl } from "@/lib/event-hub";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Atomic, capacity-guarded increment (see 0038_atomic_ticket_discount_counters.sql)
 *  — a plain read-then-write here would let two concurrent free registrations for
 *  the last unit of a capacity-limited ticket both pass the availability check and
 *  both succeed, the same race already fixed on the paid path in paystack.ts. */
async function incrementTicketQuantitySold(supabase: SupabaseClient, ticketTypeId: string) {
  const { data: incremented, error } = await supabase.rpc("increment_ticket_sold", { p_ticket_type_id: ticketTypeId });
  if (error) {
    console.error(`[register] couldn't increment quantity_sold for ticket ${ticketTypeId}:`, error.message);
  } else if (!incremented) {
    console.error(`[register] OVERSOLD: ticket type ${ticketTypeId} was already at capacity for a free registration — needs manual review.`);
  }
}

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
  const { eventId, firstName, lastName, email, phone, customAnswers, ticketTypeId } = body;

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
      "id, name, date, end_date, start_time, end_time, timezone, capture_override, event_format, virtual_join_url, virtual_platform, virtual_access_notes, venue, location, self_registration_enabled, published"
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
      })
      .select()
      .single();
    if (leadError || !lead) {
      return NextResponse.json({ error: leadError?.message || "Couldn't complete your registration." }, { status: 500 });
    }

    if (ticketTypeIdForRegistration) await incrementTicketQuantitySold(supabase, ticketTypeIdForRegistration);

    const hub = await tryHubUrl(lead.email, `${firstName.trim()} ${lastName.trim()}`);
    const emailSent = await sendVirtualConfirmationEmail(lead.email, event, hub);
    return NextResponse.json({ success: true, emailSent, hubUrl: hub, event: responseEvent });
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
      })
      .select()
      .single();
    if (data) {
      registration = data;
    } else if (error?.code !== "23505") {
      return NextResponse.json({ error: error?.message || "Couldn't complete your registration." }, { status: 500 });
    }
  }
  if (!registration) return NextResponse.json({ error: "Couldn't complete your registration. Please try again." }, { status: 500 });

  if (ticketTypeIdForRegistration) await incrementTicketQuantitySold(supabase, ticketTypeIdForRegistration);

  const hub = await tryHubUrl(registration.email, registration.full_name);
  const emailSent = await sendRegistrationEmail(registration.email, registration.reference_id, event, hub);

  return NextResponse.json({ success: true, referenceId: registration.reference_id, emailSent, hubUrl: hub, event: responseEvent });
}
