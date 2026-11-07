import { NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { sanitizeRichTextHtml, stripHtml } from "@/lib/rich-text";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import { hostInlineImages } from "@/lib/email-images";
import {
  AudienceSchema,
  buildCampaignEmail,
  GreetingSchema,
  PLATFORM_UNSUBSCRIBE_SCOPE,
  resolveAudience,
  type CampaignAudience,
  type Greeting,
  type Recipient,
} from "@/lib/platform-campaigns";

/**
 * Sends an eventbuddy campaign (platform admins only), in chunks so a large
 * list never runs into the function time limit: the first call freezes the
 * recipient list on a platform_campaigns row and sends the first chunk; the
 * page then calls again with { campaignId, offset } until it's done or paused.
 *
 * Daily batches (migration 0144): with a `limit`, the campaign pauses after
 * that many emails (pause_at). { campaignId, resume, limit } later picks up
 * where it stopped, first adding anyone who has joined the audience since and
 * hasn't had this email, so nobody gets it twice.
 */
const CHUNK = 500; // recipients per call: 5 Resend batch calls of 100
const BATCH = 100;

const Limit = z.number().int().min(1).max(100000).optional();
const Start = z.object({
  draftId: z.string().uuid().optional(),
  subject: z.string().trim().min(1, "Write a subject line.").max(200),
  messageHtml: z.string().trim().min(1, "Write something to send."),
  ctaLabel: z.string().trim().max(60).optional(),
  ctaUrl: z.string().trim().url().optional(),
  audience: AudienceSchema,
  greeting: GreetingSchema.optional(),
  limit: Limit,
});
const Continue = z.object({ campaignId: z.string().uuid(), offset: z.number().int().min(0) });
const Resume = z.object({ campaignId: z.string().uuid(), resume: z.literal(true), limit: Limit });

type CampaignRow = {
  id: string;
  subject: string;
  message_html: string;
  cta_label: string | null;
  cta_url: string | null;
  greeting: Greeting | null;
  audience: CampaignAudience;
  recipients: Recipient[];
  sent_count: number;
  next_offset: number;
  pause_at: number | null;
  status: string;
};
const COLUMNS = "id, subject, message_html, cta_label, cta_url, greeting, audience, recipients, sent_count, next_offset, pause_at, status";

function progress(c: CampaignRow, extra: { done?: boolean; paused?: boolean } = {}) {
  return NextResponse.json({
    campaignId: c.id,
    done: extra.done ?? c.status === "sent",
    paused: extra.paused ?? c.status === "paused",
    nextOffset: c.next_offset,
    sentCount: c.sent_count,
    total: c.recipients.length,
  });
}

export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if ("response" in auth) return auth.response;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return NextResponse.json({ error: "Email isn't configured yet." }, { status: 500 });
  const body = await request.json().catch(() => null);
  const admin = createAdminClient();

  let campaign: CampaignRow;
  let offset: number;

  const resume = Resume.safeParse(body);
  const cont = Continue.safeParse(body);
  if (resume.success) {
    const { data } = await admin.from("platform_campaigns").select(COLUMNS).eq("id", resume.data.campaignId).maybeSingle();
    if (!data) return NextResponse.json({ error: "That campaign couldn't be found." }, { status: 404 });
    const c = data as CampaignRow;
    if (c.status !== "paused") return progress(c);
    // anyone who joined the audience since and hasn't had this email
    const fresh = await resolveAudience(admin, c.audience);
    const have = new Set(c.recipients.map((r) => r.email));
    const added = "error" in fresh ? [] : fresh.recipients.filter((r) => !have.has(r.email));
    const recipients = [...c.recipients, ...added];
    const pauseAt = resume.data.limit ? c.next_offset + resume.data.limit : null;
    const { data: updated } = await admin
      .from("platform_campaigns")
      .update({ recipients, recipient_count: recipients.length, pause_at: pauseAt, status: "sending", updated_at: new Date().toISOString() })
      .eq("id", c.id)
      .eq("status", "paused")
      .select(COLUMNS)
      .maybeSingle();
    if (!updated) return progress(c);
    campaign = updated as CampaignRow;
    offset = campaign.next_offset;
  } else if (cont.success) {
    const { data } = await admin.from("platform_campaigns").select(COLUMNS).eq("id", cont.data.campaignId).maybeSingle();
    if (!data) return NextResponse.json({ error: "That campaign couldn't be found." }, { status: 404 });
    campaign = data as CampaignRow;
    if (campaign.status !== "sending") return progress(campaign);
    // only ever the next unsent chunk: a retried or duplicate request picks up
    // where the campaign actually is, never re-sends a chunk
    offset = campaign.next_offset;
    if (cont.data.offset !== offset) return progress(campaign);
  } else {
    const parsed = Start.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the campaign and try again." }, { status: 400 });
    const { draftId, subject, ctaLabel, ctaUrl, audience, greeting, limit } = parsed.data;
    const messageHtml = sanitizeRichTextHtml(parsed.data.messageHtml);
    if (!stripHtml(messageHtml).trim()) return NextResponse.json({ error: "Write something to send." }, { status: 400 });
    if ((ctaLabel && !ctaUrl) || (!ctaLabel && ctaUrl)) return NextResponse.json({ error: "A button needs both its text and a link." }, { status: 400 });
    if (!(await checkRateLimit(`platform-campaign:user:${auth.userId}`, 10, 60 * 60))) return rateLimitedResponse();
    const result = await resolveAudience(admin, audience);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    if (result.recipients.length === 0) return NextResponse.json({ error: "Nobody to send to: this audience is empty (or everyone in it has unsubscribed)." }, { status: 400 });

    // a saved draft becomes the campaign; otherwise a new row. The id comes
    // first: pictures are stored under it, and it's the tracking tag.
    if (draftId) {
      const { data: draft } = await admin.from("platform_campaigns").select("id, status").eq("id", draftId).maybeSingle();
      if (!draft || draft.status !== "draft") return NextResponse.json({ error: "That draft was already sent or deleted. Reload the page." }, { status: 409 });
    }
    const id = draftId ?? crypto.randomUUID();
    const hostedHtml = await hostInlineImages(admin, messageHtml, `platform/campaigns/${id}`);
    const fields = {
      sent_by: auth.userId,
      subject,
      message_html: hostedHtml,
      cta_label: ctaLabel ?? null,
      cta_url: ctaUrl ?? null,
      greeting: greeting ?? null,
      audience,
      audience_label: result.label,
      recipients: result.recipients,
      recipient_count: result.recipients.length,
      next_offset: 0,
      sent_count: 0,
      pause_at: limit ?? null,
      status: "sending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = draftId
      ? await admin.from("platform_campaigns").update(fields).eq("id", id).eq("status", "draft").select(COLUMNS).maybeSingle()
      : await admin.from("platform_campaigns").insert({ id, ...fields }).select(COLUMNS).single();
    if (error || !data) return NextResponse.json({ error: error?.message || "That draft was already sent. Reload the page." }, { status: error ? 500 : 409 });
    campaign = data as CampaignRow;
    offset = 0;
  }

  const total = campaign.recipients.length;
  const stopAt = Math.min(total, campaign.pause_at ?? total);
  // reached today's limit (or nothing left): pause or finish without sending
  if (offset >= stopAt) {
    const status = offset >= total ? "sent" : "paused";
    await admin
      .from("platform_campaigns")
      .update({ status, ...(status === "sent" ? { finished_at: new Date().toISOString() } : {}), updated_at: new Date().toISOString() })
      .eq("id", campaign.id);
    return progress({ ...campaign, status });
  }

  // Claim this chunk before sending anything: only one request can move
  // next_offset from here, so two at once can never email the same people.
  const chunk = campaign.recipients.slice(offset, Math.min(offset + CHUNK, stopAt));
  const nextOffset = offset + chunk.length;
  const { data: claimed } = await admin
    .from("platform_campaigns")
    .update({ next_offset: nextOffset })
    .eq("id", campaign.id)
    .eq("next_offset", offset)
    .select("id")
    .maybeSingle();
  if (!claimed) {
    const { data: now } = await admin.from("platform_campaigns").select(COLUMNS).eq("id", campaign.id).single();
    return progress((now ?? campaign) as CampaignRow);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const resend = new Resend(apiKey);
  let sent = 0;
  for (let i = 0; i < chunk.length; i += BATCH) {
    const payloads = chunk
      .slice(i, i + BATCH)
      .map((r) =>
        buildCampaignEmail(
          r,
          { id: campaign.id, subject: campaign.subject, messageHtml: campaign.message_html, ctaLabel: campaign.cta_label, ctaUrl: campaign.cta_url, greeting: campaign.greeting },
          unsubscribeUrl(siteUrl, PLATFORM_UNSUBSCRIBE_SCOPE, r.email)
        )
      );
    try {
      const { data, error } = await resend.batch.send(payloads);
      if (!error) sent += data?.data?.length ?? payloads.length;
      else console.error(`[platform-campaign] ${campaign.id} batch at ${offset + i} failed:`, error.message);
    } catch (err) {
      console.error(`[platform-campaign] ${campaign.id} batch at ${offset + i} failed:`, err instanceof Error ? err.message : err);
    }
  }

  const done = nextOffset >= total;
  const paused = !done && nextOffset >= stopAt;
  const { data: latest } = await admin.from("platform_campaigns").select("sent_count").eq("id", campaign.id).single();
  const sentCount = (latest?.sent_count ?? 0) + sent;
  const status = done ? "sent" : paused ? "paused" : "sending";
  await admin
    .from("platform_campaigns")
    .update({ sent_count: sentCount, status, ...(done ? { finished_at: new Date().toISOString() } : {}), updated_at: new Date().toISOString() })
    .eq("id", campaign.id);
  return progress({ ...campaign, next_offset: nextOffset, sent_count: sentCount, status });
}
