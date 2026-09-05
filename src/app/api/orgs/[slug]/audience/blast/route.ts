import { NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveOrgAccess } from "@/lib/org-access";
import { renderEmailShell, emailButton, escapeHtml } from "@/lib/email-template";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { sanitizeRichTextHtml, stripHtml } from "@/lib/rich-text";
import { getEventStatus } from "@/lib/capture-window";

const TargetSchema = z.object({
  eventId: z.string().uuid(),
  status: z.enum(["registered", "checked_in", "no_show"]),
});

const BodySchema = z.object({
  subject: z.string().trim().min(1, "Write a subject line."),
  messageHtml: z.string().trim().min(1, "Write something to send."),
  ctaLabel: z.string().trim().optional(),
  ctaUrl: z.string().trim().url().optional(),
  target: TargetSchema.optional(),
});

// Resend's batch endpoint caps at 100 emails per call — batching (one HTTP
// round trip per 100 recipients) instead of N individual sends is what keeps a
// large blast from running into Netlify's function timeout, not just an
// efficiency nicety.
const BATCH_SIZE = 100;

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || "";
}

/** Rewrites every embedded data:image/* <img> into a cid: reference and returns
 *  the matching Resend attachment for it — data: image URLs don't render in most
 *  email clients (Gmail, Outlook strip or block them), the same reason the
 *  registration QR email already uses this exact cid:/attachments pattern
 *  instead of an inline data URL. Remote https:// images pass through
 *  untouched (already real, loadable URLs). */
function extractInlineImages(html: string): { html: string; attachments: { filename: string; content: string; contentId: string }[] } {
  let count = 0;
  const attachments: { filename: string; content: string; contentId: string }[] = [];
  const rewritten = html.replace(/<img\s+[^>]*src="data:image\/([a-zA-Z0-9.+-]+);base64,([^"]+)"[^>]*>/g, (full, subtype: string, base64: string) => {
    count += 1;
    const cid = `blast-img-${count}`;
    attachments.push({ filename: `image-${count}.${subtype.split("+")[0]}`, content: base64, contentId: cid });
    const altMatch = /alt="([^"]*)"/.exec(full);
    const alt = altMatch ? altMatch[1] : "";
    const styleMatch = /style="([^"]*)"/.exec(full);
    const style = styleMatch ? styleMatch[1] : "max-width:100%;";
    return `<img src="cid:${cid}" alt="${alt}" style="${style}">`;
  });
  return { html: rewritten, attachments };
}

type Recipient = { email: string; fullName: string };

/** Everyone in the org's whole audience (organization_audience — every past
 *  registrant/lead plus direct followers, deduped by email since the RPC's
 *  union-all can legitimately list the same person under more than one source). */
async function wholeAudienceRecipients(admin: SupabaseClient, orgId: string): Promise<Recipient[]> {
  const { data } = await admin.rpc("organization_audience", { p_organization_id: orgId });
  const seen = new Set<string>();
  const recipients: Recipient[] = [];
  for (const a of (data ?? []) as { email: string; full_name: string | null }[]) {
    const email = a.email.toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    recipients.push({ email, fullName: a.full_name || "" });
  }
  return recipients;
}

/** One event's attendees, filtered to registered / checked-in / no-show. Virtual
 *  events only ever support "registered" — leads have no checked_in_at column or
 *  check-in concept at all, so the other two segments are meaningless for them. */
async function eventRecipients(
  admin: SupabaseClient,
  orgId: string,
  eventId: string,
  status: "registered" | "checked_in" | "no_show"
): Promise<{ recipients: Recipient[] } | { error: string }> {
  const { data: event } = await admin
    .from("events")
    .select("id, date, end_date, start_time, end_time, timezone, event_format")
    .eq("id", eventId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!event) return { error: "This event couldn't be found." };

  if (event.event_format === "virtual") {
    if (status !== "registered") return { error: "Virtual events only support the Registered segment — there's no check-in for a virtual event." };
    const { data } = await admin.from("leads").select("email, first_name, last_name").eq("event_id", eventId).eq("status", "registered");
    return { recipients: (data ?? []).map((l) => ({ email: l.email.toLowerCase(), fullName: `${l.first_name} ${l.last_name}`.trim() })) };
  }

  let query = admin.from("registrations").select("email, full_name").eq("event_id", eventId);
  if (status === "checked_in") {
    query = query.eq("status", "checked_in");
  } else if (status === "no_show") {
    const eventStatus = getEventStatus({ date: event.date, endDate: event.end_date ?? undefined, startTime: event.start_time ?? undefined, endTime: event.end_time ?? undefined, timezone: event.timezone ?? undefined });
    if (eventStatus !== "completed") return { error: "No-show can only be targeted once the event has ended." };
    query = query.eq("status", "registered").is("checked_in_at", null);
  } else {
    query = query.in("status", ["registered", "checked_in"]);
  }
  const { data } = await query;
  return { recipients: (data ?? []).map((r) => ({ email: r.email.toLowerCase(), fullName: r.full_name })) };
}

function buildEmailPayload(
  to: string,
  recipientName: string,
  orgName: string,
  orgLogoUrl: string | undefined,
  subject: string,
  messageHtml: string,
  ctaLabel: string | undefined,
  ctaUrl: string | undefined,
  unsubUrl: string
) {
  const greeting = recipientName ? `Hi ${escapeHtml(firstName(recipientName))},` : "Hi there,";
  const logoHtml = orgLogoUrl
    ? `<img src="${orgLogoUrl}" alt="${escapeHtml(orgName)}" width="44" height="44" style="border-radius:10px; display:block; margin:0 0 16px; object-fit:cover;">`
    : "";
  const ctaHtml = ctaLabel && ctaUrl ? `<div style="margin-top:24px;">${emailButton(escapeHtml(ctaUrl), escapeHtml(ctaLabel), "#C21FAF")}</div>` : "";
  const rawBodyHtml = `
    ${logoHtml}
    <p style="margin:0 0 4px; font-weight:600; color:#1e1b2e;">${greeting}</p>
    <div style="color:#333;">${messageHtml}</div>
    ${ctaHtml}
    <p style="margin:24px 0 0; padding-top:16px; border-top:1px solid #eee; font-size:11px; color:#aaa;">
      You're receiving this because you're part of ${escapeHtml(orgName)}'s audience on eventbuddy.
      <a href="${unsubUrl}" style="color:#aaa;">Unsubscribe</a>
    </p>
  `;
  const { html: bodyHtml, attachments } = extractInlineImages(rawBodyHtml);

  return {
    from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
    to,
    subject,
    text: `${greeting}\n\n${stripHtml(messageHtml)}${ctaLabel && ctaUrl ? `\n\n${ctaLabel}: ${ctaUrl}` : ""}\n\nUnsubscribe: ${unsubUrl}`,
    html: renderEmailShell({ color: "#C21FAF", label: orgName, emoji: "📣" }, bodyHtml),
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}

/**
 * Sends an organizer-authored message either to the org's whole audience
 * (organization_audience) or, when `target` is given, to one event's
 * registered/checked-in/no-show attendees instead. Owner/admin only;
 * event_support never reaches this (they only ever have one event's data, not
 * the org's whole audience).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/audience/blast">) {
  const { slug } = await ctx.params;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input." }, { status: 400 });
  }
  const { subject, ctaLabel, ctaUrl, target } = parsed.data;
  const messageHtml = sanitizeRichTextHtml(parsed.data.messageHtml);
  if (!stripHtml(messageHtml).trim()) return NextResponse.json({ error: "Write something to send." }, { status: 400 });
  if ((ctaLabel && !ctaUrl) || (!ctaLabel && ctaUrl)) {
    return NextResponse.json({ error: "A button needs both label and URL." }, { status: 400 });
  }

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

  const result = target ? await eventRecipients(admin, org.id, target.eventId, target.status) : { recipients: await wholeAudienceRecipients(admin, org.id) };
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  const { data: suppressed } = await admin.from("organization_email_suppressions").select("email").eq("organization_id", org.id);
  const suppressedSet = new Set((suppressed ?? []).map((s) => s.email.toLowerCase()));
  const recipients = result.recipients.filter((r) => !suppressedSet.has(r.email));
  if (recipients.length === 0) return NextResponse.json({ success: true, sentCount: 0, totalCount: 0 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const resend = new Resend(apiKey);
  let sentCount = 0;

  // One batch API call per 100 recipients rather than one individual send per
  // recipient — far fewer network round trips, which is what keeps a large
  // blast from running into the platform's function timeout.
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const chunk = recipients.slice(i, i + BATCH_SIZE);
    const payloads = chunk.map((r) =>
      buildEmailPayload(r.email, r.fullName, org.name, org.logo_url ?? undefined, subject, messageHtml, ctaLabel, ctaUrl, unsubscribeUrl(siteUrl, org.id, r.email))
    );
    try {
      const { data, error } = await resend.batch.send(payloads);
      if (!error) sentCount += data?.data?.length ?? chunk.length;
    } catch {
      // This batch failed outright — move on rather than aborting the whole
      // blast over one bad chunk.
    }
  }

  return NextResponse.json({ success: true, sentCount, totalCount: recipients.length });
}
