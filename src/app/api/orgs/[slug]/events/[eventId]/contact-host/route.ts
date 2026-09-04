import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailButton, escapeHtml, renderEmailShell } from "@/lib/email-template";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";

const ContactHostSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120),
  email: z.string().trim().email("Enter a valid email address."),
  message: z.string().trim().min(1, "Enter a message.").max(4000),
});

/**
 * Relays a visitor's message to the organizer without ever exposing the
 * organizer's own email address to the browser — mirrors /api/contact's pattern
 * exactly (reply-to set to the visitor, so the organizer just hits reply).
 * organizations.email is the organizer's own preferred contact address when set;
 * falls back to their account email (the address they actually signed up with)
 * since that column is often left blank.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/contact-host">) {
  const { slug, eventId } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = ContactHostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the form and try again." }, { status: 400 });
  }
  const { name, email, message } = parsed.data;

  if (!(await checkRateLimit(`contact-host:ip:${clientIp(request)}`, 8, 10 * 60))) {
    return rateLimitedResponse();
  }

  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("id, name, email, owner_user_id").ilike("slug", slug).maybeSingle();
  if (!org) return NextResponse.json({ error: "No organization found for that link." }, { status: 404 });

  const { data: event } = await admin.from("events").select("id, name").eq("id", eventId).eq("organization_id", org.id).maybeSingle();
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });

  let hostEmail = org.email;
  if (!hostEmail) {
    const { data: ownerUser } = await admin.auth.admin.getUserById(org.owner_user_id);
    hostEmail = ownerUser.user?.email ?? null;
  }
  if (!hostEmail) return NextResponse.json({ error: "This host can't be reached right now." }, { status: 404 });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") {
    return NextResponse.json({ error: "Not configured yet." }, { status: 500 });
  }
  const resend = new Resend(apiKey);

  const bodyHtml = `
    <h1 style="font-size:19px; margin:0 0 12px;">Message about ${escapeHtml(event.name)}</h1>
    <p style="margin:0 0 4px; color:#666;">From <strong style="color:#1e1b2e;">${escapeHtml(name)}</strong> — ${escapeHtml(email)}</p>
    <p style="margin:16px 0; padding:14px 16px; background:#f8fafc; border-radius:10px; color:#1e1b2e; white-space:pre-wrap;">${escapeHtml(message)}</p>
    ${emailButton(`mailto:${encodeURIComponent(email)}`, "Reply", "#C21FAF")}
  `;
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
    to: hostEmail,
    replyTo: email,
    subject: `[${event.name}] Message from ${name}`,
    text: `From ${name} <${email}>\n\n${message}`,
    html: renderEmailShell({ color: "#C21FAF", label: "New message", emoji: "✉️" }, bodyHtml),
  });
  if (error) return NextResponse.json({ error: "Couldn't send your message. Please try again." }, { status: 502 });

  return NextResponse.json({ success: true });
}
