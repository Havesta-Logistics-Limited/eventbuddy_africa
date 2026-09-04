import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml, renderEmailShell } from "@/lib/email-template";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";

const ReportSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").optional().or(z.literal("")),
  reason: z.string().trim().min(1, "Tell us what's wrong.").max(2000),
});

/**
 * Flags an event to the eventbuddy team — same notify-only pattern as account
 * deletion requests (no new table; this is rare enough that an email the platform
 * team acts on manually is proportionate, unlike the 1-on-1/discount-code features
 * where the organizer needs an ongoing dashboard view of many rows).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/report">) {
  const { slug, eventId } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = ReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the form and try again." }, { status: 400 });
  }
  const { email, reason } = parsed.data;

  if (!(await checkRateLimit(`report-event:ip:${clientIp(request)}`, 5, 30 * 60))) {
    return rateLimitedResponse();
  }

  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("id, name, slug").ilike("slug", slug).maybeSingle();
  if (!org) return NextResponse.json({ error: "No organization found for that link." }, { status: 404 });

  const { data: event } = await admin.from("events").select("id, name").eq("id", eventId).eq("organization_id", org.id).maybeSingle();
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") {
    return NextResponse.json({ error: "Not configured yet." }, { status: 500 });
  }
  const resend = new Resend(apiKey);
  const to = process.env.CONTACT_INBOX_EMAIL || "info@eventbuddy.africa";

  const bodyHtml = `
    <h1 style="font-size:19px; margin:0 0 12px;">${escapeHtml(event.name)}</h1>
    <p style="margin:0 0 4px; color:#666;">Organizer: ${escapeHtml(org.name)} (${escapeHtml(org.slug || "")})</p>
    ${email ? `<p style="margin:0 0 12px; color:#666;">Reported by: ${escapeHtml(email)}</p>` : ""}
    <p style="margin:16px 0; padding:14px 16px; background:#f8fafc; border-radius:10px; color:#1e1b2e; white-space:pre-wrap;">${escapeHtml(reason)}</p>
  `;
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
    to,
    replyTo: email || undefined,
    subject: `[Reported event] ${event.name}`,
    text: `${event.name}\nOrganizer: ${org.name} (${org.slug})\n${email ? `Reported by: ${email}\n` : ""}\n${reason}`,
    html: renderEmailShell({ color: "#DC2626", label: "Event reported", emoji: "🚩" }, bodyHtml),
  });
  if (error) return NextResponse.json({ error: "Couldn't send your report. Please try again." }, { status: 502 });

  return NextResponse.json({ success: true });
}
