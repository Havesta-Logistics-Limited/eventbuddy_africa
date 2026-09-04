import QRCode from "qrcode";
import { Resend } from "resend";
import { formatTime, safeHttpUrl } from "@/lib/utils";
import { emailButton, escapeHtml } from "@/lib/email-template";

/** Shared between the free self-registration route and the paid ticket-purchase
 *  finalize path (src/lib/paystack.ts) — a confirmed attendee gets the same email
 *  regardless of whether their ticket was free or paid. */

export type RegisteredEvent = {
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

export function eventDateTimeLine(event: RegisteredEvent) {
  const eventDate = new Date(event.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const eventTime = event.start_time ? `${formatTime(event.start_time)}${event.end_time ? ` - ${formatTime(event.end_time)}` : ""}` : "";
  return { eventDate, eventTime };
}

/** hubUrl links to this attendee's Event Hub (schedule, speakers, Q&A,
 *  announcements) — see src/lib/event-hub.ts. Always present in practice (both
 *  registration paths provision Hub access before sending this), but optional here
 *  so a Hub-provisioning failure never blocks the confirmation email itself from
 *  going out with everything else the attendee actually needs (QR/reference ID). */

/** Best-effort confirmation email with the reference ID + QR code — physical events
 *  only, since there's a real check-in to show it at. Registration has already
 *  succeeded by the time this runs, so a failure here (missing Resend key, provider
 *  error) is swallowed rather than surfaced as a failed registration. */
export async function sendRegistrationEmail(to: string, referenceId: string, event: RegisteredEvent, hubUrl?: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  try {
    const qrBase64 = (await QRCode.toBuffer(referenceId, { width: 320, margin: 1 })).toString("base64");
    const { eventDate, eventTime } = eventDateTimeLine(event);
    const safeName = escapeHtml(event.name);

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: `You're registered for ${event.name}`,
      text: `You're registered for ${event.name} on ${eventDate}${eventTime ? ` at ${eventTime}` : ""}.\n\nYour reference ID: ${referenceId}\n\nKeep this — you'll need it at check-in.${hubUrl ? `\n\nEvent hub (schedule, speakers, Q&A): ${hubUrl}` : ""}`,
      html: `
        <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 420px; margin: 0 auto; color: #1e1b2e;">
          <p style="text-transform:uppercase; letter-spacing:0.06em; font-size:11px; color:#C21FAF; font-weight:600; margin:0 0 8px;">Registration confirmed</p>
          <h1 style="font-size:20px; margin:0 0 12px;">${safeName}</h1>
          <p style="margin:0 0 4px; color:#666; font-size:13px;">${eventDate}${eventTime ? ` · ${eventTime}` : ""}</p>
          <p style="margin:0;">${escapeHtml(event.venue)}, ${escapeHtml(event.location)}</p>
          <div style="text-align:center; margin:24px 0;">
            <img src="cid:qr-code" width="200" height="200" alt="Your registration QR code" style="border:1px solid #eee; border-radius:8px;" />
            <p style="font-family: monospace; font-size:20px; font-weight:700; letter-spacing:0.08em; margin:16px 0 0;">${referenceId}</p>
          </div>
          <p style="color:#888; font-size:12px; margin:0 0 20px;">Keep this email — show the QR code (or your reference ID) at check-in.</p>
          ${hubUrl ? `<div style="text-align:center;">${emailButton(hubUrl, "Open event hub", "#C21FAF")}</div><p style="color:#aaa; font-size:11px; text-align:center; margin-top:10px;">Schedule, speakers, and live Q&A for this event.</p>` : ""}
        </div>
      `,
      attachments: [{ filename: `${referenceId}-qr-code.png`, content: qrBase64, contentId: "qr-code" }],
    });
    return !error;
  } catch {
    return false;
  }
}

/** Best-effort confirmation that a 1-on-1 interest request went through — sent right
 *  after submission on the post-registration step. Nothing is scheduled yet at this
 *  point (the organizer still has to work out the actual matching), so this is
 *  deliberately just an acknowledgement, not a booking confirmation. */
export async function sendOneOnOneRequestConfirmation(to: string, eventName: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  try {
    const safeEventName = escapeHtml(eventName);

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: `Your 1-on-1 request for ${eventName}`,
      text: `We got your 1-on-1 request for ${eventName}. The organizer will reach out to set up a meeting for you at the event.`,
      html: `
        <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 420px; margin: 0 auto; color: #1e1b2e;">
          <p style="text-transform:uppercase; letter-spacing:0.06em; font-size:11px; color:#C21FAF; font-weight:600; margin:0 0 8px;">1-on-1 requested</p>
          <h1 style="font-size:20px; margin:0 0 12px;">${safeEventName}</h1>
          <p style="margin:0; color:#666;">We've let the organizer know you're interested — they'll set up a meeting for you at the event.</p>
        </div>
      `,
    });
    return !error;
  } catch {
    return false;
  }
}

/** Sent when the organizer has worked out the actual matching and clicks "Notify" on
 *  the 1-on-1s dashboard tab — tells the attendee where/who to meet. Organizer-
 *  triggered (not automatic on assignment), so it never fires before the organizer
 *  is actually ready to tell them. */
export async function sendOneOnOneAssignmentNotification(to: string, eventName: string, assignment: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  try {
    const safeEventName = escapeHtml(eventName);
    const safeAssignment = escapeHtml(assignment);

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: `Your 1-on-1 at ${eventName} is set`,
      text: `Your 1-on-1 at ${eventName} is confirmed: ${assignment}. See you there!`,
      html: `
        <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 420px; margin: 0 auto; color: #1e1b2e;">
          <p style="text-transform:uppercase; letter-spacing:0.06em; font-size:11px; color:#C21FAF; font-weight:600; margin:0 0 8px;">1-on-1 confirmed</p>
          <h1 style="font-size:20px; margin:0 0 12px;">${safeEventName}</h1>
          <p style="margin:0; font-size:16px; font-weight:600;">${safeAssignment}</p>
          <p style="margin:12px 0 0; color:#666;">See you there!</p>
        </div>
      `,
    });
    return !error;
  } catch {
    return false;
  }
}

/** Confirmation email for a virtual event — no QR/reference ID (there's no physical
 *  check-in), just the join details. Mirrors sendRegistrationEmail's tone. */
export async function sendVirtualConfirmationEmail(to: string, event: RegisteredEvent, hubUrl?: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  try {
    const { eventDate, eventTime } = eventDateTimeLine(event);
    const safeName = escapeHtml(event.name);
    // Scheme-checked, not just HTML-escaped — escapeHtml alone still lets a
    // javascript:/data: URI through as a live href.
    const validJoinUrl = safeHttpUrl(event.virtual_join_url);
    const safeJoinUrl = validJoinUrl ? escapeHtml(validJoinUrl) : "";
    const joinInfoHtml = `<p style="margin:0 0 4px;">${event.virtual_platform ? `${escapeHtml(event.virtual_platform)} — ` : ""}${safeJoinUrl ? `<a href="${safeJoinUrl}">${safeJoinUrl}</a>` : ""}</p>${
      event.virtual_access_notes ? `<p style="margin:0; color:#666; font-size:13px; white-space:pre-line;">${escapeHtml(event.virtual_access_notes)}</p>` : ""
    }`;

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: `You're registered for ${event.name}`,
      text: `You're registered for ${event.name} on ${eventDate}${eventTime ? ` at ${eventTime}` : ""}.\n\nJoin here: ${event.virtual_join_url}${hubUrl ? `\n\nEvent hub (schedule, speakers, Q&A): ${hubUrl}` : ""}`,
      html: `
        <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 420px; margin: 0 auto; color: #1e1b2e;">
          <p style="text-transform:uppercase; letter-spacing:0.06em; font-size:11px; color:#C21FAF; font-weight:600; margin:0 0 8px;">Registration confirmed</p>
          <h1 style="font-size:20px; margin:0 0 12px;">${safeName}</h1>
          <p style="margin:0 0 12px; color:#666; font-size:13px;">${eventDate}${eventTime ? ` · ${eventTime}` : ""}</p>
          ${joinInfoHtml}
          <p style="color:#888; font-size:12px; margin:20px 0;">This is a virtual event — no check-in required, just join at the time above.</p>
          ${hubUrl ? `<div style="text-align:center;">${emailButton(hubUrl, "Open event hub", "#C21FAF")}</div><p style="color:#aaa; font-size:11px; text-align:center; margin-top:10px;">Schedule, speakers, and live Q&A for this event.</p>` : ""}
        </div>
      `,
    });
    return !error;
  } catch {
    return false;
  }
}

/** Sent instead of the real confirmation when the event requires approval — no QR/
 *  reference ID goes out yet since nothing is confirmed; that follows separately via
 *  sendRegistrationEmail/sendVirtualConfirmationEmail once the organizer approves. */
export async function sendPendingApprovalEmail(to: string, event: RegisteredEvent) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  try {
    const { eventDate, eventTime } = eventDateTimeLine(event);
    const safeName = escapeHtml(event.name);

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: `Your registration for ${event.name} is pending approval`,
      text: `We got your registration for ${event.name} on ${eventDate}${eventTime ? ` at ${eventTime}` : ""}. The organizer reviews registrations before confirming them — we'll email you as soon as yours is approved.`,
      html: `
        <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 420px; margin: 0 auto; color: #1e1b2e;">
          <p style="text-transform:uppercase; letter-spacing:0.06em; font-size:11px; color:#D97706; font-weight:600; margin:0 0 8px;">Pending approval</p>
          <h1 style="font-size:20px; margin:0 0 12px;">${safeName}</h1>
          <p style="margin:0 0 12px; color:#666; font-size:13px;">${eventDate}${eventTime ? ` · ${eventTime}` : ""}</p>
          <p style="margin:0; color:#666;">The organizer reviews registrations before confirming them. We'll email you as soon as yours is approved.</p>
        </div>
      `,
    });
    return !error;
  } catch {
    return false;
  }
}

/** Sent when a capacity-limited ticket is sold out and the organizer has waitlisting
 *  on — the attendee is captured, not confirmed; promotion to a real registration is
 *  a manual organizer action, which sends the normal confirmation email at that point. */
export async function sendWaitlistEmail(to: string, event: RegisteredEvent) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  try {
    const { eventDate, eventTime } = eventDateTimeLine(event);
    const safeName = escapeHtml(event.name);

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: `You're on the waitlist for ${event.name}`,
      text: `${event.name} on ${eventDate}${eventTime ? ` at ${eventTime}` : ""} is at capacity, but we've added you to the waitlist. We'll email you right away if a spot opens up.`,
      html: `
        <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 420px; margin: 0 auto; color: #1e1b2e;">
          <p style="text-transform:uppercase; letter-spacing:0.06em; font-size:11px; color:#D97706; font-weight:600; margin:0 0 8px;">Waitlisted</p>
          <h1 style="font-size:20px; margin:0 0 12px;">${safeName}</h1>
          <p style="margin:0 0 12px; color:#666; font-size:13px;">${eventDate}${eventTime ? ` · ${eventTime}` : ""}</p>
          <p style="margin:0; color:#666;">This event is at capacity, but you're on the waitlist. We'll email you right away if a spot opens up.</p>
        </div>
      `,
    });
    return !error;
  } catch {
    return false;
  }
}

/** Sent when the organizer declines a pending registration. */
export async function sendDeclinedEmail(to: string, event: RegisteredEvent) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  try {
    const safeName = escapeHtml(event.name);

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: `Update on your registration for ${event.name}`,
      text: `Your registration for ${event.name} wasn't approved this time.`,
      html: `
        <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 420px; margin: 0 auto; color: #1e1b2e;">
          <h1 style="font-size:20px; margin:0 0 12px;">${safeName}</h1>
          <p style="margin:0; color:#666;">Your registration wasn't approved this time.</p>
        </div>
      `,
    });
    return !error;
  } catch {
    return false;
  }
}
