import { NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { sanitizeRichTextHtml, stripHtml } from "@/lib/rich-text";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import { AudienceSchema, buildCampaignEmail, PLATFORM_UNSUBSCRIBE_SCOPE, resolveAudience, type Recipient } from "@/lib/platform-campaigns";

/**
 * Sends an eventbuddy campaign (platform admins only), in chunks so a large
 * list never runs into the function time limit: the first call freezes the
 * recipient list on a platform_campaigns row and sends the first chunk; the
 * page then calls again with { campaignId, offset } until done.
 */
const CHUNK = 500; // recipients per call: 5 Resend batch calls of 100
const BATCH = 100;

const Start = z.object({
  subject: z.string().trim().min(1, "Write a subject line.").max(200),
  messageHtml: z.string().trim().min(1, "Write something to send."),
  ctaLabel: z.string().trim().max(60).optional(),
  ctaUrl: z.string().trim().url().optional(),
  audience: AudienceSchema,
});
const Continue = z.object({ campaignId: z.string().uuid(), offset: z.number().int().min(0) });

export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if ("response" in auth) return auth.response;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return NextResponse.json({ error: "Email isn't configured yet." }, { status: 500 });
  const body = await request.json().catch(() => null);
  const admin = createAdminClient();

  let campaign: { id: string; subject: string; message_html: string; cta_label: string | null; cta_url: string | null; recipients: Recipient[]; sent_count: number; next_offset: number };
  let offset = 0;
  const cont = Continue.safeParse(body);
  if (cont.success) {
    const { data } = await admin
      .from("platform_campaigns")
      .select("id, subject, message_html, cta_label, cta_url, recipients, sent_count, next_offset, status")
      .eq("id", cont.data.campaignId)
      .maybeSingle();
    if (!data) return NextResponse.json({ error: "That campaign couldn't be found." }, { status: 404 });
    const total = (data.recipients as Recipient[]).length;
    if (data.status === "sent") return NextResponse.json({ campaignId: data.id, done: true, nextOffset: total, sentCount: data.sent_count, total });
    // only ever the next unsent chunk: a retried or duplicate request picks up
    // where the campaign actually is, never re-sends a chunk
    campaign = data as typeof campaign;
    offset = data.next_offset;
    if (cont.data.offset !== offset) {
      return NextResponse.json({ campaignId: data.id, done: false, nextOffset: offset, sentCount: data.sent_count, total });
    }
  } else {
    const parsed = Start.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the campaign and try again." }, { status: 400 });
    const { subject, ctaLabel, ctaUrl, audience } = parsed.data;
    const messageHtml = sanitizeRichTextHtml(parsed.data.messageHtml);
    if (!stripHtml(messageHtml).trim()) return NextResponse.json({ error: "Write something to send." }, { status: 400 });
    if ((ctaLabel && !ctaUrl) || (!ctaLabel && ctaUrl)) return NextResponse.json({ error: "A button needs both its text and a link." }, { status: 400 });
    if (!(await checkRateLimit(`platform-campaign:user:${auth.userId}`, 10, 60 * 60))) return rateLimitedResponse();
    const result = await resolveAudience(admin, audience);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    if (result.recipients.length === 0) return NextResponse.json({ error: "Nobody to send to: this audience is empty (or everyone in it has unsubscribed)." }, { status: 400 });
    const { data, error } = await admin
      .from("platform_campaigns")
      .insert({
        sent_by: auth.userId,
        subject,
        message_html: messageHtml,
        cta_label: ctaLabel ?? null,
        cta_url: ctaUrl ?? null,
        audience,
        audience_label: result.label,
        recipients: result.recipients,
        recipient_count: result.recipients.length,
      })
      .select("id, subject, message_html, cta_label, cta_url, recipients, sent_count, next_offset")
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message || "Couldn't start the campaign." }, { status: 500 });
    campaign = data as typeof campaign;
  }

  // Claim this chunk before sending anything: only one request can move
  // next_offset from here, so two at once can never email the same people.
  const chunk = campaign.recipients.slice(offset, offset + CHUNK);
  const nextOffset = offset + chunk.length;
  const done = nextOffset >= campaign.recipients.length;
  const { data: claimed } = await admin
    .from("platform_campaigns")
    .update({ next_offset: nextOffset })
    .eq("id", campaign.id)
    .eq("next_offset", offset)
    .select("id")
    .maybeSingle();
  if (!claimed) {
    const { data: now } = await admin.from("platform_campaigns").select("next_offset, sent_count").eq("id", campaign.id).single();
    return NextResponse.json({ campaignId: campaign.id, done: false, nextOffset: now?.next_offset ?? offset, sentCount: now?.sent_count ?? 0, total: campaign.recipients.length });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const resend = new Resend(apiKey);
  let sent = 0;
  for (let i = 0; i < chunk.length; i += BATCH) {
    const payloads = chunk
      .slice(i, i + BATCH)
      .map((r) =>
        buildCampaignEmail(r, { subject: campaign.subject, messageHtml: campaign.message_html, ctaLabel: campaign.cta_label, ctaUrl: campaign.cta_url }, unsubscribeUrl(siteUrl, PLATFORM_UNSUBSCRIBE_SCOPE, r.email))
      );
    try {
      const { data, error } = await resend.batch.send(payloads);
      if (!error) sent += data?.data?.length ?? payloads.length;
      else console.error(`[platform-campaign] ${campaign.id} batch at ${offset + i} failed:`, error.message);
    } catch (err) {
      console.error(`[platform-campaign] ${campaign.id} batch at ${offset + i} failed:`, err instanceof Error ? err.message : err);
    }
  }

  const { data: latest } = await admin.from("platform_campaigns").select("sent_count").eq("id", campaign.id).single();
  const sentCount = (latest?.sent_count ?? 0) + sent;
  await admin
    .from("platform_campaigns")
    .update({ sent_count: sentCount, ...(done ? { status: "sent", finished_at: new Date().toISOString() } : {}) })
    .eq("id", campaign.id);
  return NextResponse.json({ campaignId: campaign.id, done, nextOffset, sentCount, total: campaign.recipients.length });
}
