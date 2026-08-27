import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyEventGuest } from "@/lib/event-guest";
import { getRegistrationGate, windowFromEvent } from "@/lib/capture-window";
import { generateReferenceId } from "@/lib/utils";
import { sendRegistrationEmail, sendVirtualConfirmationEmail } from "@/lib/registration-email";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";
import { ensureHubMember, hubUrl as buildHubUrl } from "@/lib/event-hub";

/**
 * The RSVP response flow for an invite-only (guest-list) event — see
 * events.isInviteOnly and event_guests. GET resolves the invite for the RSVP
 * page; POST records the guest's response. `token` is the whole trust
 * boundary here, same model as the Event Hub's hub_token: unguessable
 * (uuid), never brute-forceable, rate-limited defensively anyway.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/rsvp">) {
  const { slug, eventId } = await ctx.params;
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing invite token." }, { status: 400 });

  if (!(await checkRateLimit(`rsvp-get:token:${token}`, 60, 10 * 60))) {
    return rateLimitedResponse();
  }
  if (!(await checkRateLimit(`rsvp-get:ip:${clientIp(request)}`, 120, 10 * 60))) {
    return rateLimitedResponse();
  }

  const admin = createAdminClient();
  const guest = await verifyEventGuest(admin, { slug, eventId, token });
  if (!guest) return NextResponse.json({ error: "This invite link isn't valid." }, { status: 403 });

  const { data: event } = await admin
    .from("events")
    .select("id, name, date, start_time, end_time, event_format, virtual_join_url, virtual_platform, virtual_access_notes, venue, location, description, custom_fields")
    .eq("id", eventId)
    .eq("organization_id", guest.organizationId)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });

  return NextResponse.json({
    guest: {
      fullName: guest.fullName,
      email: guest.email,
      status: guest.status,
      plusOnesAllowed: guest.plusOnesAllowed,
      plusOnesConfirmed: guest.plusOnesConfirmed,
    },
    event: {
      name: event.name,
      date: event.date,
      startTime: event.start_time,
      endTime: event.end_time,
      eventFormat: event.event_format ?? "physical",
      virtualJoinUrl: event.virtual_join_url,
      virtualPlatform: event.virtual_platform,
      virtualAccessNotes: event.virtual_access_notes,
      venue: event.venue,
      location: event.location,
      description: event.description,
      customFields: event.custom_fields ?? [],
    },
  });
}

type PlusOneInput = { name: string; email?: string };
type RsvpBody = {
  token: string;
  response: "accepted" | "declined" | "maybe";
  plusOnes?: PlusOneInput[];
  customAnswers?: Record<string, string | string[]>;
};

export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/rsvp">) {
  const { slug, eventId } = await ctx.params;
  const body = (await request.json().catch(() => null)) as Partial<RsvpBody> | null;
  const token = body?.token;
  const response = body?.response;
  if (!token || !response || !["accepted", "declined", "maybe"].includes(response)) {
    return NextResponse.json({ error: "Missing or invalid response." }, { status: 400 });
  }

  if (!(await checkRateLimit(`rsvp-post:token:${token}`, 20, 10 * 60))) {
    return rateLimitedResponse();
  }
  if (!(await checkRateLimit(`rsvp-post:ip:${clientIp(request)}`, 60, 10 * 60))) {
    return rateLimitedResponse();
  }

  const admin = createAdminClient();
  const guest = await verifyEventGuest(admin, { slug, eventId, token });
  if (!guest) return NextResponse.json({ error: "This invite link isn't valid." }, { status: 403 });

  // Named plus-ones, each capped to the invite's allowance and given their own
  // real registration/lead below — a headcount alone doesn't get anyone their own
  // QR code to check in with.
  const rawPlusOnes = (Array.isArray(body?.plusOnes) ? body!.plusOnes! : []).slice(0, 50);
  const plusOneGuests = rawPlusOnes
    .filter((p) => p && typeof p.name === "string" && p.name.trim().length > 0)
    .slice(0, guest.plusOnesAllowed)
    .map((p) => ({ name: p.name.trim(), email: typeof p.email === "string" && p.email.trim() ? p.email.trim() : undefined }));
  const cappedPlusOnes = plusOneGuests.length;
  const customAnswers = body?.customAnswers && typeof body.customAnswers === "object" ? body.customAnswers : {};

  const { data: event } = await admin
    .from("events")
    .select(
      "id, name, date, end_date, start_time, end_time, timezone, capture_override, event_format, virtual_join_url, virtual_platform, virtual_access_notes, venue, location, published"
    )
    .eq("id", eventId)
    .eq("organization_id", guest.organizationId)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });
  if (!event.published) return NextResponse.json({ error: "This event isn't live yet." }, { status: 403 });

  // Declining or staying "maybe" is always allowed regardless of the registration
  // window — only accepting (which creates a real registration/lead) needs the
  // same open-window guarantee self-service registration has.
  if (response === "accepted") {
    const gate = getRegistrationGate(
      windowFromEvent({ date: event.date, endDate: event.end_date ?? undefined, startTime: event.start_time ?? undefined, endTime: event.end_time ?? undefined }),
      event.timezone ?? undefined,
      event.capture_override ?? undefined
    );
    if (!gate.open) {
      const message = gate.reason === "manually_closed" ? "RSVPs have been closed by the event organizer." : "This event has already ended.";
      return NextResponse.json({ error: message }, { status: 403 });
    }
  }

  if (response !== "accepted") {
    const { error } = await admin
      .from("event_guests")
      .update({ status: response, responded_at: new Date().toISOString() })
      .eq("id", guest.guestId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, status: response });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const responseEvent = {
    name: event.name,
    date: event.date,
    eventFormat: (event.event_format ?? "physical") as "physical" | "virtual",
    virtualJoinUrl: event.virtual_join_url ?? undefined,
    virtualPlatform: event.virtual_platform ?? undefined,
    virtualAccessNotes: event.virtual_access_notes ?? undefined,
    venue: event.venue,
    location: event.location,
  };

  /** Best-effort, same trade-off as the open register route this mirrors. */
  async function tryHubUrl(attendeeEmail: string, attendeeName: string): Promise<string | undefined> {
    try {
      const { hubToken } = await ensureHubMember(admin, { organizationId: guest!.organizationId, eventId, email: attendeeEmail, fullName: attendeeName });
      return buildHubUrl(siteUrl, slug, eventId, hubToken);
    } catch {
      return undefined;
    }
  }

  // Primary guest first, then each named plus-one — every party member gets their
  // own real attendee record (lead for virtual, registration+QR for physical), not
  // just a headcount folded into the primary's row.
  const party = [{ name: guest.fullName, email: guest.email }, ...plusOneGuests.map((p) => ({ name: p.name, email: p.email || guest.email }))];

  if (event.event_format === "virtual") {
    // A retry after a partial failure (network drop mid-loop, a later party
    // member's insert erroring) must not re-create party members that already
    // got a lead + confirmation email on a prior attempt — event_guests.status
    // only flips to "accepted" once the whole loop succeeds, so a retry starts
    // this function over from party[0] every time.
    const { data: existingLeads } = await admin
      .from("leads")
      .select("*")
      .eq("guest_invite_id", guest.guestId)
      .order("created_at", { ascending: true });

    const attendees: { name: string; emailSent: boolean; hubUrl?: string }[] = [];
    for (const [i, person] of party.entries()) {
      const already = existingLeads?.[i];
      if (already) {
        const hub = await tryHubUrl(already.email, person.name);
        attendees.push({ name: person.name, emailSent: false, hubUrl: hub });
        continue;
      }

      const [firstName, ...rest] = person.name.split(" ");
      const { data: lead, error: leadError } = await admin
        .from("leads")
        .insert({
          organization_id: guest.organizationId,
          event_id: eventId,
          guest_invite_id: guest.guestId,
          first_name: firstName || person.name,
          last_name: rest.join(" "),
          email: person.email,
          phone: "",
          preferred_course: "",
          level_of_interest: "",
          start_year: "",
          highest_education: "",
          taken_ielts: "",
          comments: "",
          // Only the primary guest (party[0]) answers custom questions — plus-ones
          // are named for their own check-in record, not asked to fill out the form.
          custom_answers: i === 0 ? customAnswers : {},
        })
        .select()
        .single();
      if (leadError || !lead) return NextResponse.json({ error: leadError?.message || "Couldn't record your RSVP." }, { status: 500 });

      const hub = await tryHubUrl(lead.email, person.name);
      const emailSent = await sendVirtualConfirmationEmail(lead.email, event, hub);
      attendees.push({ name: person.name, emailSent, hubUrl: hub });
    }

    await admin
      .from("event_guests")
      .update({ status: "accepted", responded_at: new Date().toISOString(), plus_ones_confirmed: cappedPlusOnes })
      .eq("id", guest.guestId);

    return NextResponse.json({ success: true, status: "accepted", attendees, event: responseEvent });
  }

  // Same retry-after-partial-failure protection as the virtual branch above —
  // event_guests.status only flips once every party member succeeds, so a
  // retry re-runs this whole loop from party[0].
  const { data: existingRegistrations } = await admin
    .from("registrations")
    .select("*")
    .eq("guest_invite_id", guest.guestId)
    .order("created_at", { ascending: true });

  const attendees: { name: string; referenceId: string; emailSent: boolean; hubUrl?: string }[] = [];
  let primaryRegistrationId: string | null = null;
  for (const [i, person] of party.entries()) {
    const already = existingRegistrations?.[i];
    if (already) {
      if (primaryRegistrationId === null) primaryRegistrationId = already.id;
      const hub = await tryHubUrl(already.email, already.full_name);
      attendees.push({ name: person.name, referenceId: already.reference_id, emailSent: false, hubUrl: hub });
      continue;
    }

    let registration = null;
    for (let attempt = 0; attempt < 5 && !registration; attempt++) {
      const { data, error } = await admin
        .from("registrations")
        .insert({
          organization_id: guest.organizationId,
          event_id: eventId,
          reference_id: generateReferenceId(),
          full_name: person.name,
          email: person.email,
          phone: null,
          custom_answers: i === 0 ? customAnswers : {},
          guest_invite_id: guest.guestId,
        })
        .select()
        .single();
      if (data) {
        registration = data;
      } else if (error?.code !== "23505") {
        return NextResponse.json({ error: error?.message || "Couldn't record your RSVP." }, { status: 500 });
      }
    }
    if (!registration) return NextResponse.json({ error: "Couldn't record your RSVP. Please try again." }, { status: 500 });
    if (primaryRegistrationId === null) primaryRegistrationId = registration.id;

    const hub = await tryHubUrl(registration.email, registration.full_name);
    const emailSent = await sendRegistrationEmail(registration.email, registration.reference_id, event, hub);
    attendees.push({ name: person.name, referenceId: registration.reference_id, emailSent, hubUrl: hub });
  }

  await admin
    .from("event_guests")
    .update({ status: "accepted", responded_at: new Date().toISOString(), plus_ones_confirmed: cappedPlusOnes, registration_id: primaryRegistrationId })
    .eq("id", guest.guestId);

  return NextResponse.json({ success: true, status: "accepted", attendees, event: responseEvent });
}
