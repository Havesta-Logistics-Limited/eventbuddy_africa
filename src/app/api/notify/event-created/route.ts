import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { emailButton, renderEmailShell } from "@/lib/email-template";
import { formatDate } from "@/lib/utils";

/** Fire-and-forget confirmation for a freshly created event — called from the
 *  dashboard right after addEvent succeeds. Best-effort like every other
 *  transactional email here: a missing Resend key or provider error never blocks
 *  event creation itself, it just means no email goes out this time. */
async function sendEventCreatedEmail(to: string, firstName: string, eventName: string, eventDate: string, manageUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  const bodyHtml = `
    <p style="margin:0 0 16px;">Hi ${firstName},</p>
    <h1 style="font-size:19px; margin:0 0 12px;">${eventName} is live</h1>
    <p style="margin:0 0 20px; color:#666;">Your event is set up and ready — attendees can register, and you can start capturing leads the moment doors open on ${eventDate}.</p>
    <p style="margin:0 0 20px; color:#666;">From here, you can add ticket types, invite check-in staff, and share your registration link — all from your event's own page.</p>
    ${emailButton(manageUrl, "Manage your event", "#b45309")}
  `;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: `${eventName} is live on eventbuddy`,
      text: `${eventName} is live! Manage it here: ${manageUrl}`,
      html: renderEmailShell({ color: "#b45309", label: "Event created", emoji: "🎉" }, bodyHtml),
    });
    return !error;
  } catch {
    return false;
  }
}

const NotifySchema = z.object({
  email: z.string().trim().email(),
  firstName: z.string().trim().min(1),
  eventId: z.string().trim().min(1),
  eventName: z.string().trim().min(1),
  eventDate: z.string().trim().min(1),
  orgSlug: z.string().trim().min(1).optional(),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = NotifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input." }, { status: 400 });
  }
  const { email, firstName, eventId, eventName, eventDate } = parsed.data;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const manageUrl = `${siteUrl}/events/${eventId}`;
  const emailSent = await sendEventCreatedEmail(email, firstName, eventName, formatDate(eventDate), manageUrl);

  return NextResponse.json({ success: true, emailSent });
}
