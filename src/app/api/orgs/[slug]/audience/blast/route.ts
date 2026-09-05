import { NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveOrgAccess } from "@/lib/org-access";
import { renderEmailShell, escapeHtml } from "@/lib/email-template";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { stripHtml } from "@/lib/rich-text";

const BodySchema = z.object({
  subject: z.string().trim().min(1, "Write a subject line."),
  message: z.string().trim().min(1, "Write something to send."),
});

// A blast tool is structurally a spam tool if left unbounded — same reasoning as
// the per-event broadcast route's cap, just scoped to an org's whole audience
// instead of one event's attendees.
const CHUNK_SIZE = 20;

async function sendOne(resend: Resend, to: string, orgName: string, subject: string, message: string, unsubUrl: string) {
  const bodyHtml = `
    <p style="margin:0 0 20px; white-space:pre-line;">${escapeHtml(message)}</p>
    <p style="margin:24px 0 0; padding-top:16px; border-top:1px solid #eee; font-size:11px; color:#aaa;">
      You're receiving this because you're part of ${escapeHtml(orgName)}'s audience on eventbuddy.
      <a href="${unsubUrl}" style="color:#aaa;">Unsubscribe</a>
    </p>
  `;
  try {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject,
      text: `${message}\n\nUnsubscribe: ${unsubUrl}`,
      html: renderEmailShell({ color: "#C21FAF", label: orgName, emoji: "📣" }, bodyHtml),
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Sends an organizer-authored message to their whole audience (organization_audience
 * — every past registrant/lead plus direct followers, deduped). Owner/admin only;
 * event_support never reaches this (they only ever have one event's data, not the
 * org's whole audience).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/audience/blast">) {
  const { slug } = await ctx.params;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input." }, { status: 400 });
  }
  const { subject, message } = parsed.data;
  if (!stripHtml(message).trim()) return NextResponse.json({ error: "Write something to send." }, { status: 400 });

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!(await checkRateLimit(`audience-blast:user:${user.id}`, 5, 60 * 60))) {
    return rateLimitedResponse();
  }

  const access = await resolveOrgAccess(supabase, user.id, slug);
  if (!access || access.role !== "admin") {
    return NextResponse.json({ error: "Not authorized to send a blast for this organization." }, { status: 403 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") {
    return NextResponse.json({ error: "Email isn't configured yet." }, { status: 500 });
  }

  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("id, name").eq("id", access.id).maybeSingle();
  if (!org) return NextResponse.json({ error: "This organization couldn't be found." }, { status: 404 });

  const { data: audience, error: audienceError } = await admin.rpc("organization_audience", { p_organization_id: org.id });
  if (audienceError) return NextResponse.json({ error: audienceError.message }, { status: 500 });

  const { data: suppressed } = await admin.from("organization_email_suppressions").select("email").eq("organization_id", org.id);
  const suppressedSet = new Set((suppressed ?? []).map((s) => s.email.toLowerCase()));

  const recipients = ((audience ?? []) as { email: string }[]).map((a) => a.email.toLowerCase()).filter((email) => !suppressedSet.has(email));
  if (recipients.length === 0) return NextResponse.json({ success: true, sentCount: 0, totalCount: 0 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const resend = new Resend(apiKey);
  let sentCount = 0;

  for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
    const chunk = recipients.slice(i, i + CHUNK_SIZE);
    const results = await Promise.all(chunk.map((email) => sendOne(resend, email, org.name, subject, message, unsubscribeUrl(siteUrl, org.id, email))));
    sentCount += results.filter(Boolean).length;
  }

  return NextResponse.json({ success: true, sentCount, totalCount: recipients.length });
}
