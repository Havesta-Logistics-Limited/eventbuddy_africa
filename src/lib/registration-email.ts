import QRCode from "qrcode";
import { Resend } from "resend";
import { formatTime } from "@/lib/utils";
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

/** Confirmation email for a virtual event — no QR/reference ID (there's no physical
 *  check-in), just the join details. Mirrors sendRegistrationEmail's tone. */
export async function sendVirtualConfirmationEmail(to: string, event: RegisteredEvent, hubUrl?: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  try {
    const { eventDate, eventTime } = eventDateTimeLine(event);
    const safeName = escapeHtml(event.name);
    const safeJoinUrl = event.virtual_join_url ? escapeHtml(event.virtual_join_url) : "";
    const joinInfoHtml = `<p style="margin:0 0 4px;">${event.virtual_platform ? `${escapeHtml(event.virtual_platform)} — ` : ""}<a href="${safeJoinUrl}">${safeJoinUrl}</a></p>${
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
