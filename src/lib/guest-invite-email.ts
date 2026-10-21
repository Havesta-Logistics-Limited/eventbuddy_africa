import { Resend } from "resend";
import { emailButton, escapeHtml, renderEmailShell } from "@/lib/email-template";
import { eventDateTimeLine, type RegisteredEvent } from "@/lib/registration-email";

/** The RSVP invite itself — deliberately a single "Respond to this invite" link
 *  to the RSVP page, not three separate Accept/Decline/Maybe links in the email.
 *  A GET link that records a response directly would be silently triggered by
 *  email-client link-prescanning (Gmail Safe Browsing, Outlook Safe Links),
 *  recording a false response before the guest ever opens the email — the same
 *  failure mode already seen with signup verification links this session. The
 *  actual response only happens via an explicit POST on the RSVP page itself. */
export async function sendGuestInviteEmail(to: string, fullName: string, event: RegisteredEvent, rsvpUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  try {
    const { eventDate, eventTime } = eventDateTimeLine(event);
    const safeName = escapeHtml(event.name);
    const safeGuestName = escapeHtml(fullName);
    const whereLine =
      event.event_format === "virtual" ? escapeHtml(event.virtual_platform || "Online") : `${escapeHtml(event.venue)}, ${escapeHtml(event.location)}`;

    const bodyHtml = `
      <p style="margin:0 0 16px;">Hi ${safeGuestName},</p>
      <h1 style="font-size:19px; margin:0 0 12px;">You're invited to ${safeName}</h1>
      <p style="margin:0 0 4px; color:#666;">${eventDate}${eventTime ? ` · ${eventTime}` : ""}</p>
      <p style="margin:0 0 20px; color:#666;">${whereLine}</p>
      <p style="margin:0 0 20px; color:#666;">Let us know if you can make it — it only takes a moment.</p>
      ${emailButton(rsvpUrl, "Respond to this invite", "#C21FAF")}
    `;

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: `You're invited: ${event.name}`,
      text: `You're invited to ${event.name} — ${eventDate}${eventTime ? ` at ${eventTime}` : ""}.\n\nRespond here: ${rsvpUrl}`,
      html: renderEmailShell({ color: "#6D28D9", label: "You're invited", emoji: "✉️" }, bodyHtml),
    });
    return !error;
  } catch {
    return false;
  }
}

/** A single, one-time nudge for guests who still haven't responded as the event
 *  approaches — see /api/cron/rsvp-reminders, which tracks reminder_sent_at so
 *  this only ever goes out once per guest regardless of how often the cron runs. */
export async function sendGuestReminderEmail(to: string, fullName: string, event: RegisteredEvent, rsvpUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  try {
    const { eventDate, eventTime } = eventDateTimeLine(event);
    const safeName = escapeHtml(event.name);
    const safeGuestName = escapeHtml(fullName);

    const bodyHtml = `
      <p style="margin:0 0 16px;">Hi ${safeGuestName},</p>
      <h1 style="font-size:19px; margin:0 0 12px;">Still coming to ${safeName}?</h1>
      <p style="margin:0 0 4px; color:#666;">${eventDate}${eventTime ? ` · ${eventTime}` : ""}</p>
      <p style="margin:0 0 20px; color:#666;">We haven't heard back yet — it's coming up soon, so let us know either way.</p>
      ${emailButton(rsvpUrl, "Respond to this invite", "#C21FAF")}
    `;

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: `Reminder: still coming to ${event.name}?`,
      text: `We haven't heard back about ${event.name} (${eventDate}${eventTime ? ` at ${eventTime}` : ""}) — let us know here: ${rsvpUrl}`,
      html: renderEmailShell({ color: "#9a3412", label: "RSVP reminder", emoji: "⏰" }, bodyHtml),
    });
    return !error;
  } catch {
    return false;
  }
}

/** A confirmed guest's invitation (migration 0136): the organizer's flyer with
 *  the guest's own entry QR and name on it, shown in the email and attached so
 *  it can be saved, plus a link to their invitation page. */
export async function sendGuestFlyerEmail(to: string, fullName: string, event: RegisteredEvent, flyerPng: Buffer, inviteUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;
  try {
    const { eventDate, eventTime } = eventDateTimeLine(event);
    const safeName = escapeHtml(event.name);
    const bodyHtml = `
      <p style="margin:0 0 16px;">Dear ${escapeHtml(fullName)},</p>
      <h1 style="font-size:19px; margin:0 0 12px;">You're invited to ${safeName}</h1>
      <p style="margin:0 0 4px; color:#666;">${eventDate}${eventTime ? ` · ${eventTime}` : ""}</p>
      <p style="margin:0 0 18px; color:#666;">${escapeHtml(event.venue)}, ${escapeHtml(event.location)}</p>
      <img src="cid:invitation" alt="Your invitation with your entry QR code" width="480" style="display:block; width:100%; max-width:480px; height:auto; border-radius:12px; margin:0 0 18px;" />
      <p style="margin:0 0 18px; color:#666;">Your QR code is on your invitation. Show it at the entrance; it's yours alone and works once.</p>
      ${emailButton(inviteUrl, "Open my invitation", "#C21FAF")}
    `;
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: `Your invitation: ${event.name}`,
      text: `Dear ${fullName}, you're invited to ${event.name} — ${eventDate}${eventTime ? ` at ${eventTime}` : ""}. Your invitation with your entry QR code: ${inviteUrl}`,
      html: renderEmailShell({ color: "#6D28D9", label: "Your invitation", emoji: "✉️" }, bodyHtml),
      attachments: [{ filename: "invitation.png", content: flyerPng.toString("base64"), contentId: "invitation" }],
    });
    return !error;
  } catch {
    return false;
  }
}
