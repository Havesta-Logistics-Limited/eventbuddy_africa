import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRegistrationGate, windowFromEvent } from "@/lib/capture-window";
import { formatTime, generateReferenceId } from "@/lib/utils";

type RegisteredEvent = {
  name: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  event_format: string | null;
  virtual_join_url: string | null;
  virtual_platform: string | null;
  virtual_access_notes: string | null;
  venue: string;
  location: string;
};

function eventDateTimeLine(event: RegisteredEvent) {
  const eventDate = new Date(event.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const eventTime = event.start_time ? `${formatTime(event.start_time)}${event.end_time ? ` - ${formatTime(event.end_time)}` : ""}` : "";
  return { eventDate, eventTime };
}

/** Best-effort confirmation email with the reference ID + QR code — physical events
 *  only, since there's a real check-in to show it at. Registration has already
 *  succeeded by the time this runs, so a failure here (missing Resend key, provider
 *  error) is swallowed rather than surfaced as a failed registration. */
async function sendRegistrationEmail(to: string, referenceId: string, event: RegisteredEvent) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  try {
    const qrBase64 = (await QRCode.toBuffer(referenceId, { width: 320, margin: 1 })).toString("base64");
    const { eventDate, eventTime } = eventDateTimeLine(event);

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: `You're registered for ${event.name}`,
      text: `You're registered for ${event.name} on ${eventDate}${eventTime ? ` at ${eventTime}` : ""}.\n\nYour reference ID: ${referenceId}\n\nKeep this — you'll need it at check-in.`,
      html: `
        <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 420px; margin: 0 auto; color: #1e1b2e;">
          <p style="text-transform:uppercase; letter-spacing:0.06em; font-size:11px; color:#610064; font-weight:600; margin:0 0 8px;">Registration confirmed</p>
          <h1 style="font-size:20px; margin:0 0 12px;">${event.name}</h1>
          <p style="margin:0 0 4px; color:#666; font-size:13px;">${eventDate}${eventTime ? ` · ${eventTime}` : ""}</p>
          <p style="margin:0;">${event.venue}, ${event.location}</p>
          <div style="text-align:center; margin:24px 0;">
            <img src="cid:qr-code" width="200" height="200" alt="Your registration QR code" style="border:1px solid #eee; border-radius:8px;" />
            <p style="font-family: monospace; font-size:20px; font-weight:700; letter-spacing:0.08em; margin:16px 0 0;">${referenceId}</p>
          </div>
          <p style="color:#888; font-size:12px;">Keep this email — show the QR code (or your reference ID) at check-in.</p>
        </div>
      `,
      attachments: [{ filename: `${referenceId}-qr-code.png`, content: qrBase64, contentId: "qr-code" }],
    });
    return !error;
  } catch {
    return false;
  }
}

/** Confirmation email for a virtual event — no QR/reference ID (there's no physical
 *  check-in), just the join details. Mirrors sendRegistrationEmail's tone. */
async function sendVirtualConfirmationEmail(to: string, event: RegisteredEvent) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  try {
    const { eventDate, eventTime } = eventDateTimeLine(event);
    const joinInfoHtml = `<p style="margin:0 0 4px;">${event.virtual_platform ? `${event.virtual_platform} — ` : ""}<a href="${event.virtual_join_url}">${event.virtual_join_url}</a></p>${
      event.virtual_access_notes ? `<p style="margin:0; color:#666; font-size:13px; white-space:pre-line;">${event.virtual_access_notes}</p>` : ""
    }`;

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: `You're registered for ${event.name}`,
      text: `You're registered for ${event.name} on ${eventDate}${eventTime ? ` at ${eventTime}` : ""}.\n\nJoin here: ${event.virtual_join_url}`,
      html: `
        <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 420px; margin: 0 auto; color: #1e1b2e;">
          <p style="text-transform:uppercase; letter-spacing:0.06em; font-size:11px; color:#610064; font-weight:600; margin:0 0 8px;">Registration confirmed</p>
          <h1 style="font-size:20px; margin:0 0 12px;">${event.name}</h1>
          <p style="margin:0 0 12px; color:#666; font-size:13px;">${eventDate}${eventTime ? ` · ${eventTime}` : ""}</p>
          ${joinInfoHtml}
          <p style="color:#888; font-size:12px; margin-top:20px;">This is a virtual event — no check-in required, just join at the time above.</p>
        </div>
      `,
    });
    return !error;
  } catch {
    return false;
  }
}

type RegisterBody = {
  eventId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  customAnswers?: Record<string, string | string[]>;
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
  const { eventId, firstName, lastName, email, phone, customAnswers } = body;

  if (!eventId || !firstName?.trim() || !lastName?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
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

    const emailSent = await sendVirtualConfirmationEmail(lead.email, event);
    return NextResponse.json({ success: true, emailSent, event: responseEvent });
  }

  let registration = null;
  for (let attempt = 0; attempt < 5 && !registration; attempt++) {
    const { data, error } = await supabase
      .from("registrations")
      .insert({
        organization_id: org.id,
        event_id: event.id,
        reference_id: generateReferenceId(),
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

  const emailSent = await sendRegistrationEmail(registration.email, registration.reference_id, event);

  return NextResponse.json({ success: true, referenceId: registration.reference_id, emailSent, event: responseEvent });
}
