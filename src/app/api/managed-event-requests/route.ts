import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { normalizePhone } from "@/lib/validation";
import { BUDGET_OPTIONS } from "@/lib/managed-events";
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
  budget?: string;
  message?: string;
};

const RequestSchema = z.object({
  contactName: z.string().trim().min(1, "Enter your name.").max(120),
  contactEmail: z.string().trim().email("Enter a valid email address."),
  // Every field is required except the free-text message (2026-10-06).
  contactPhone: z
    .string()
    .trim()
    .max(40)
    .transform((v, ctx) => {
      const n = normalizePhone(v);
      if (!n) {
        ctx.addIssue({ code: "custom", message: "Enter a valid phone number." });
        return z.NEVER;
      }
      return n;
    }),
  organizationName: z.string().trim().min(1, "Enter your organization.").max(160),
  eventName: z.string().trim().min(1, "Enter the event name.").max(160),
  eventDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the event date."),
  expectedAttendees: z.string().trim().min(1, "Enter the expected number of attendees.").max(40),
  city: z.string().trim().min(1, "Enter the city or venue.").max(120),
  budget: z.enum(BUDGET_OPTIONS, { message: "Choose a budget range." }),
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
        body.budget ? `Budget: ${body.budget}` : null,
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
  // Missing fields become "" so each gets its own readable message rather than
  // zod's generic "expected string, received undefined".
  const blanks = { contactName: "", contactEmail: "", contactPhone: "", organizationName: "", eventName: "", eventDate: "", expectedAttendees: "", city: "", budget: "" };
  const parsed = RequestSchema.safeParse(body && typeof body === "object" ? { ...blanks, ...body } : blanks);
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
    contact_phone: parsed.data.contactPhone,
    organization_name: parsed.data.organizationName,
    event_name: eventName,
    event_date: parsed.data.eventDate,
    expected_attendees: parsed.data.expectedAttendees,
    city,
    budget: parsed.data.budget,
    message: parsed.data.message || null,
  });
  if (error) {
    return NextResponse.json({ error: "Couldn't submit your request. Please try again." }, { status: 500 });
  }

  await notifyBusiness(parsed.data);
  return NextResponse.json({ ok: true });
}
