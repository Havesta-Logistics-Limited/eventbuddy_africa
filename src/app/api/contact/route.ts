import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { emailButton, escapeHtml, renderEmailShell } from "@/lib/email-template";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";

const ContactSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120),
  email: z.string().trim().email("Enter a valid email address."),
  subject: z.string().trim().min(1, "Enter a subject.").max(160),
  message: z.string().trim().min(1, "Enter a message.").max(4000),
});

/** Notifies info@ with the enquiry (reply-to set to the visitor, so replying from
 *  an inbox reaches them directly) and, best-effort, confirms receipt to the
 *  visitor — same shell/tone as every other transactional email. Both sends are
 *  swallowed on failure like the rest of this app's email; the visitor still gets
 *  a real success/error response based on whether the *notification* to info@
 *  went out, since that's the one that actually needs to land. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = ContactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the form and try again." }, { status: 400 });
  }
  const { name, email, subject, message } = parsed.data;

  if (!(await checkRateLimit(`contact:ip:${clientIp(request)}`, 5, 10 * 60))) {
    return rateLimitedResponse();
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") {
    return NextResponse.json({ error: "Not configured yet." }, { status: 500 });
  }
  const resend = new Resend(apiKey);
  const to = process.env.CONTACT_INBOX_EMAIL || "info@eventbuddy.africa";

  const notifyHtml = `
    <h1 style="font-size:19px; margin:0 0 12px;">${escapeHtml(subject)}</h1>
    <p style="margin:0 0 4px; color:#666;">From <strong style="color:#1e1b2e;">${escapeHtml(name)}</strong> — ${escapeHtml(email)}</p>
    <p style="margin:16px 0; padding:14px 16px; background:#f8fafc; border-radius:10px; color:#1e1b2e; white-space:pre-wrap;">${escapeHtml(message)}</p>
    ${emailButton(`mailto:${encodeURIComponent(email)}`, "Reply", "#C21FAF")}
  `;
  const { error: notifyError } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
    to,
    replyTo: email,
    subject: `[Contact] ${subject}`,
    text: `From ${name} <${email}>\n\n${message}`,
    html: renderEmailShell({ color: "#C21FAF", label: "New enquiry", emoji: "✉️" }, notifyHtml),
  });
  if (notifyError) {
    return NextResponse.json({ error: "Couldn't send your message. Please try again." }, { status: 502 });
  }

  const confirmHtml = `
    <h1 style="font-size:19px; margin:0 0 12px;">We got your message</h1>
    <p style="margin:0 0 16px; color:#666;">Thanks for reaching out, ${escapeHtml(name)} — we usually reply within a few hours. Here's a copy of what you sent:</p>
    <p style="margin:0 0 4px; color:#999; font-size:12px; text-transform:uppercase; letter-spacing:0.06em;">${escapeHtml(subject)}</p>
    <p style="margin:0; padding:14px 16px; background:#f8fafc; border-radius:10px; color:#1e1b2e; white-space:pre-wrap;">${escapeHtml(message)}</p>
  `;
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
    to: email,
    subject: "We got your message — eventbuddy",
    text: `Thanks for reaching out — we usually reply within a few hours.\n\nYour message:\n${message}`,
    html: renderEmailShell({ color: "#6D28D9", label: "Message received", emoji: "👋" }, confirmHtml),
  });

  return NextResponse.json({ success: true });
}
