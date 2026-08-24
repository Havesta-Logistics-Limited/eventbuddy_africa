import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { emailButton, escapeHtml, renderEmailShell } from "@/lib/email-template";
import { formatDate } from "@/lib/utils";

/** Fire-and-forget confirmation for a freshly created event — called from the
 *  dashboard right after addEvent succeeds. Best-effort like every other
 *  transactional email here: a missing Resend key or provider error never blocks
 *  event creation itself, it just means no email goes out this time. */
async function sendEventCreatedEmail(to: string, firstName: string, eventName: string, eventDate: string, manageUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  const safeName = escapeHtml(firstName);
  const safeEvent = escapeHtml(eventName);
  const bodyHtml = `
    <p style="margin:0 0 16px;">Hi ${safeName},</p>
    <h1 style="font-size:19px; margin:0 0 12px;">${safeEvent} is live</h1>
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
  eventId: z.string().trim().min(1),
});

/**
 * Requires a signed-in org admin and only ever emails *that* admin's own address
 * about *their own* organization's event — every field in the email (recipient,
 * name, event name/date) is pulled from the database, never trusted from the
 * request body. Previously took email/firstName/eventName/eventDate directly from
 * the client with no session check at all, which meant anyone who could guess an
 * eventId could make eventbuddy send an arbitrary "branded" email to any address —
 * an open relay for spam/phishing that also risked getting the sending domain
 * flagged, breaking every *real* transactional email.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = NotifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input." }, { status: 400 });
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // RLS-scoped select — only ever matches an event belonging to an org this user
  // owns, same trust boundary as every other admin-triggered mutation.
  const { data: event } = await supabase.from("events").select("id, name, date, organization_id").eq("id", parsed.data.eventId).maybeSingle();
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  const fullName = (user.user_metadata?.full_name as string | undefined)?.trim();
  const firstName = fullName?.split(/\s+/)[0] || "there";

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const manageUrl = `${siteUrl}/events/${event.id}`;
  const emailSent = await sendEventCreatedEmail(user.email, firstName, event.name, formatDate(event.date), manageUrl);

  return NextResponse.json({ success: true, emailSent });
}
