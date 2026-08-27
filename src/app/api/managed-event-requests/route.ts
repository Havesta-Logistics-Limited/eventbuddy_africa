import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";

type RequestBody = {
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  organizationName?: string;
  eventName?: string;
  eventDate?: string;
  expectedAttendees?: string;
  city?: string;
  message?: string;
};

const RequestSchema = z.object({
  contactName: z.string().trim().min(1).max(120),
  contactEmail: z.string().trim().email(),
  contactPhone: z.string().trim().max(40).optional(),
  organizationName: z.string().trim().max(160).optional(),
  eventName: z.string().trim().min(1).max(160),
  eventDate: z.string().trim().max(40).optional(),
  expectedAttendees: z.string().trim().max(40).optional(),
  city: z.string().trim().min(1).max(120),
  message: z.string().trim().max(4000).optional(),
});

/** Best-effort — the lead is already saved by the time this runs, so an email
 *  provider hiccup shouldn't turn into a failed submission for the visitor. The
 *  platform admin's Managed Events tab is the reliable place to see every request
 *  regardless of whether this email ever lands. */
async function notifyBusiness(body: Required<Pick<RequestBody, "contactName" | "contactEmail" | "eventName" | "city">> & RequestBody) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return;
  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to: "namobeda@gmail.com",
      replyTo: body.contactEmail,
      subject: `Managed event request — ${body.eventName}`,
      text: [
        `Event: ${body.eventName}`,
        `City: ${body.city}`,
        body.eventDate ? `Date: ${body.eventDate}` : null,
        body.expectedAttendees ? `Expected attendees: ${body.expectedAttendees}` : null,
        `Contact: ${body.contactName} <${body.contactEmail}>`,
        body.contactPhone ? `Phone: ${body.contactPhone}` : null,
        body.organizationName ? `Organization: ${body.organizationName}` : null,
        body.message ? `\nMessage:\n${body.message}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  } catch {
    // Swallowed — see comment above.
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Name, email, event name, and city are required." }, { status: 400 });
  }
  const { contactName, contactEmail, eventName, city } = parsed.data;

  if (!(await checkRateLimit(`managed-event-requests:ip:${clientIp(request)}`, 5, 10 * 60))) {
    return rateLimitedResponse();
  }

  const admin = createAdminClient();
  const { error } = await admin.from("managed_event_requests").insert({
    contact_name: contactName,
    contact_email: contactEmail,
    contact_phone: parsed.data.contactPhone || null,
    organization_name: parsed.data.organizationName || null,
    event_name: eventName,
    event_date: parsed.data.eventDate || null,
    expected_attendees: parsed.data.expectedAttendees || null,
    city,
    message: parsed.data.message || null,
  });
  if (error) {
    return NextResponse.json({ error: "Couldn't submit your request. Please try again." }, { status: 500 });
  }

  await notifyBusiness(parsed.data);
  return NextResponse.json({ ok: true });
}
