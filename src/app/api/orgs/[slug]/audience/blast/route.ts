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

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || "";
}

async function sendOne(
  resend: Resend,
  to: string,
  recipientName: string,
  orgName: string,
  orgLogoUrl: string | undefined,
  subject: string,
  message: string,
  unsubUrl: string
) {
  const greeting = recipientName ? `Hi ${escapeHtml(firstName(recipientName))},` : "Hi there,";
  // Blank lines mark real paragraph breaks; single line breaks within a
  // paragraph are preserved as-is (white-space:pre-line) rather than everything
  // collapsing into one run-on block.
  const paragraphs = message
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px; white-space:pre-line;">${escapeHtml(p)}</p>`)
    .join("");
  const logoHtml = orgLogoUrl
    ? `<img src="${orgLogoUrl}" alt="${escapeHtml(orgName)}" width="44" height="44" style="border-radius:10px; display:block; margin:0 0 16px; object-fit:cover;" />`
    : "";
  const bodyHtml = `
    ${logoHtml}
    <p style="margin:0 0 4px; font-weight:600; color:#1e1b2e;">${greeting}</p>
    ${paragraphs}
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
      text: `${greeting}\n\n${message}\n\nUnsubscribe: ${unsubUrl}`,
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
  const { data: org } = await admin.from("organizations").select("id, name, logo_url").eq("id", access.id).maybeSingle();
  if (!org) return NextResponse.json({ error: "This organization couldn't be found." }, { status: 404 });

  const { data: audience, error: audienceError } = await admin.rpc("organization_audience", { p_organization_id: org.id });
  if (audienceError) return NextResponse.json({ error: audienceError.message }, { status: 500 });

  const { data: suppressed } = await admin.from("organization_email_suppressions").select("email").eq("organization_id", org.id);
  const suppressedSet = new Set((suppressed ?? []).map((s) => s.email.toLowerCase()));

  const seen = new Set<string>();
  const recipients: { email: string; fullName: string }[] = [];
  for (const a of (audience ?? []) as { email: string; full_name: string | null }[]) {
    const email = a.email.toLowerCase();
    if (suppressedSet.has(email) || seen.has(email)) continue;
    seen.add(email);
    recipients.push({ email, fullName: a.full_name || "" });
  }
  if (recipients.length === 0) return NextResponse.json({ success: true, sentCount: 0, totalCount: 0 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const resend = new Resend(apiKey);
  let sentCount = 0;

  for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
    const chunk = recipients.slice(i, i + CHUNK_SIZE);
    const results = await Promise.all(
      chunk.map((r) => sendOne(resend, r.email, r.fullName, org.name, org.logo_url ?? undefined, subject, message, unsubscribeUrl(siteUrl, org.id, r.email)))
    );
    sentCount += results.filter(Boolean).length;
  }

  return NextResponse.json({ success: true, sentCount, totalCount: recipients.length });
}
