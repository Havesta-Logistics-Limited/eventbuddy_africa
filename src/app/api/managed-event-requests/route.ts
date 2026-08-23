import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const body = (await request.json().catch(() => null)) as RequestBody | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const contactName = body.contactName?.trim();
  const contactEmail = body.contactEmail?.trim();
  const eventName = body.eventName?.trim();
  const city = body.city?.trim();
  if (!contactName || !contactEmail || !eventName || !city) {
    return NextResponse.json({ error: "Name, email, event name, and city are required." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("managed_event_requests").insert({
    contact_name: contactName,
    contact_email: contactEmail,
    contact_phone: body.contactPhone?.trim() || null,
    organization_name: body.organizationName?.trim() || null,
    event_name: eventName,
    event_date: body.eventDate?.trim() || null,
    expected_attendees: body.expectedAttendees?.trim() || null,
    city,
    message: body.message?.trim() || null,
  });
  if (error) {
    return NextResponse.json({ error: "Couldn't submit your request. Please try again." }, { status: 500 });
  }

  await notifyBusiness({ contactName, contactEmail, eventName, city, ...body });
  return NextResponse.json({ ok: true });
}
