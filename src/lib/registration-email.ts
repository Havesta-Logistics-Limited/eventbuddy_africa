import QRCode from "qrcode";
import { Resend } from "resend";
import { formatTime } from "@/lib/utils";

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

/** Best-effort confirmation email with the reference ID + QR code — physical events
 *  only, since there's a real check-in to show it at. Registration has already
 *  succeeded by the time this runs, so a failure here (missing Resend key, provider
 *  error) is swallowed rather than surfaced as a failed registration. */
export async function sendRegistrationEmail(to: string, referenceId: string, event: RegisteredEvent) {
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
          <p style="text-transform:uppercase; letter-spacing:0.06em; font-size:11px; color:#1B512D; font-weight:600; margin:0 0 8px;">Registration confirmed</p>
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
export async function sendVirtualConfirmationEmail(to: string, event: RegisteredEvent) {
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
          <p style="text-transform:uppercase; letter-spacing:0.06em; font-size:11px; color:#1B512D; font-weight:600; margin:0 0 8px;">Registration confirmed</p>
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
