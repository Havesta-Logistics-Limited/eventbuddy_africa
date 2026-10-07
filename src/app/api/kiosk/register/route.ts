import { NextResponse } from "next/server";
import { optionalPhone, isValidEmail } from "@/lib/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateReferenceId } from "@/lib/utils";
import { sendRegistrationEmail } from "@/lib/registration-email";
import { ensureHubMember, hubUrl as buildHubUrl } from "@/lib/event-hub";
import { incrementTicketQuantitySold, decrementTicketQuantitySold } from "@/lib/ticket-capacity";

type Body = {
  staffId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  customAnswers?: Record<string, string | string[]>;
  ticketTypeId?: string;
};

/**
 * Kiosk walk-up registration (2026-10-07): door staff register someone for a
 * FREE event and let them straight in. The registration is created already
 * checked in (source 'kiosk'), so there is no second scan; the attendee still
 * gets their confirmation email with the QR.
 *
 * Same trust model as /api/checkin: the event comes from the staff member's
 * own row, never from the client. Staff registering someone at the door is
 * the approval, so approval and the waitlist are skipped, but a free ticket's
 * capacity is still enforced. Paid tickets are refused: walk-ups buy those on
 * their own phone from the kiosk's "buy at the door" QR.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<Body>;
  const { staffId, firstName, lastName, email, phone, customAnswers, ticketTypeId } = body;
  if (!staffId) return NextResponse.json({ error: "Your session has expired — please sign in again." }, { status: 401 });
  if (!firstName?.trim() || !lastName?.trim()) return NextResponse.json({ error: "Enter the attendee's first and last name." }, { status: 400 });
  if (!email || !isValidEmail(email.trim())) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const phoneCheck = optionalPhone(phone);
  if (!phoneCheck.ok) return NextResponse.json({ error: phoneCheck.error }, { status: 400 });

  const supabase = createAdminClient();
  const { data: staffRow } = await supabase.from("staff").select("id, event_id, organization_id").eq("id", staffId).maybeSingle();
  if (!staffRow?.event_id) return NextResponse.json({ error: "Your session has expired — please sign in again." }, { status: 401 });

  const { data: event } = await supabase
    .from("events")
    .select("id, slug, name, date, start_time, end_time, event_format, virtual_join_url, virtual_platform, virtual_access_notes, venue, location, published, organization_id, organizations(slug, is_suspended)")
    .eq("id", staffRow.event_id)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });
  const org = event.organizations as unknown as { slug: string; is_suspended: boolean } | null;
  if (org?.is_suspended) return NextResponse.json({ error: "Registration is unavailable for this event right now." }, { status: 403 });
  if (event.event_format === "virtual") return NextResponse.json({ error: "Virtual events don't have door check-in." }, { status: 400 });

  // Which ticket: the one staff chose, or the event's only free ticket.
  const { data: tickets } = await supabase.from("ticket_types").select("id, name, price_naira, group_size").eq("event_id", event.id);
  const free = (tickets ?? []).filter((t) => Number(t.price_naira) <= 0 && Number(t.group_size ?? 1) <= 1);
  let ticket: { id: string; name: string } | null = null;
  if (ticketTypeId) {
    const chosen = (tickets ?? []).find((t) => t.id === ticketTypeId);
    if (!chosen) return NextResponse.json({ error: "That ticket type isn't on this event." }, { status: 400 });
    if (Number(chosen.price_naira) > 0) return NextResponse.json({ error: "That's a paid ticket. Show the walk-up the Buy at the door QR instead." }, { status: 400 });
    ticket = chosen;
  } else if ((tickets ?? []).length > 0) {
    if (free.length === 0) return NextResponse.json({ error: "This event only sells paid tickets. Show the walk-up the Buy at the door QR instead." }, { status: 400 });
    ticket = free[0];
  }

  const cleanEmail = email.trim();
  const fullName = `${firstName.trim()} ${lastName.trim()}`;

  // Already registered (e.g. signed up online and lost the QR): just let them in.
  const { data: existing } = await supabase
    .from("registrations")
    .select("id, reference_id, full_name, status, checked_in_at")
    .eq("event_id", event.id)
    .ilike("email", cleanEmail)
    .not("status", "in", "(cancelled,declined)")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing) {
    if (existing.status === "checked_in") {
      return NextResponse.json({ success: true, outcome: "already", registration: { referenceId: existing.reference_id, fullName: existing.full_name, checkedInAt: existing.checked_in_at } });
    }
    const { data: upd } = await supabase
      .from("registrations")
      .update({ status: "checked_in", checked_in_at: new Date().toISOString(), checked_in_by: staffRow.id })
      .eq("id", existing.id)
      .select("reference_id, full_name, checked_in_at")
      .single();
    return NextResponse.json({ success: true, outcome: "existing", registration: { referenceId: upd?.reference_id, fullName: upd?.full_name, checkedInAt: upd?.checked_in_at } });
  }

  let seatReserved = false;
  if (ticket) {
    seatReserved = await incrementTicketQuantitySold(supabase, ticket.id);
    if (!seatReserved) return NextResponse.json({ error: `${ticket.name} is full. The event has reached its capacity for this ticket.` }, { status: 409 });
  }

  let registration: { reference_id: string; full_name: string; email: string; checked_in_at: string } | null = null;
  for (let attempt = 0; attempt < 5 && !registration; attempt++) {
    const { data, error } = await supabase
      .from("registrations")
      .insert({
        organization_id: event.organization_id,
        event_id: event.id,
        reference_id: generateReferenceId(),
        ticket_type_id: ticket?.id ?? null,
        full_name: fullName,
        email: cleanEmail,
        phone: phoneCheck.value,
        custom_answers: customAnswers || {},
        source: "kiosk",
        status: "checked_in",
        checked_in_at: new Date().toISOString(),
        checked_in_by: staffRow.id,
      })
      .select("reference_id, full_name, email, checked_in_at")
      .single();
    if (data) registration = data;
    else if (error?.code !== "23505") {
      if (seatReserved && ticket) await decrementTicketQuantitySold(supabase, ticket.id);
      return NextResponse.json({ error: error?.message || "Couldn't register this attendee." }, { status: 500 });
    }
  }
  if (!registration) {
    if (seatReserved && ticket) await decrementTicketQuantitySold(supabase, ticket.id);
    return NextResponse.json({ error: "Couldn't register this attendee. Please try again." }, { status: 500 });
  }

  // Best-effort: their QR and event hub link by email, for re-entry and the hub.
  let hub: string | undefined;
  try {
    const { hubToken } = await ensureHubMember(supabase, { organizationId: event.organization_id, eventId: event.id, email: cleanEmail, fullName });
    hub = buildHubUrl(process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin, org?.slug ?? "", event, hubToken);
  } catch {
    /* the ticket still works without the hub link */
  }
  const emailSent = await sendRegistrationEmail(cleanEmail, registration.reference_id, event, hub).catch(() => false);

  return NextResponse.json({
    success: true,
    outcome: "registered",
    emailSent,
    registration: { referenceId: registration.reference_id, fullName: registration.full_name, checkedInAt: registration.checked_in_at },
  });
}

/** What the kiosk's "Register walk-up" tab needs: the event's free tickets
 *  (walk-ups can be registered on the spot) and, when it sells paid tickets,
 *  the link walk-ups open on their own phone to buy one. */
export async function GET(request: Request) {
  const staffId = new URL(request.url).searchParams.get("staffId");
  if (!staffId) return NextResponse.json({ error: "Missing staff session." }, { status: 401 });
  const supabase = createAdminClient();
  const { data: staffRow } = await supabase.from("staff").select("event_id").eq("id", staffId).maybeSingle();
  if (!staffRow?.event_id) return NextResponse.json({ error: "Your session has expired — please sign in again." }, { status: 401 });
  const { data: event } = await supabase.from("events").select("id, slug, event_format, organizations(slug)").eq("id", staffRow.event_id).maybeSingle();
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });
  const { data: tickets } = await supabase
    .from("ticket_types")
    .select("id, name, price_naira, group_size, quantity_available, quantity_sold")
    .eq("event_id", event.id)
    .order("price_naira");
  const all = tickets ?? [];
  const free = all
    .filter((t) => Number(t.price_naira) <= 0 && Number(t.group_size ?? 1) <= 1)
    .map((t) => ({ id: t.id, name: t.name, left: t.quantity_available == null ? null : Math.max(0, t.quantity_available - t.quantity_sold) }));
  const orgSlug = (event.organizations as unknown as { slug: string } | null)?.slug ?? "";
  const site = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const buyUrl = event.slug ? `${site}/${event.slug}` : `${site}/${orgSlug}/events/${event.id}/register`;
  return NextResponse.json({
    virtual: event.event_format === "virtual",
    // an event with no ticket types at all is free registration
    freeRegistration: all.length === 0 || free.length > 0,
    freeTickets: free,
    sellsPaid: all.some((t) => Number(t.price_naira) > 0),
    buyUrl,
  });
}
