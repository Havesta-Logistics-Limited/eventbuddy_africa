import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { getEventStatus } from "@/lib/capture-window";
import { emailButton, escapeHtml, renderEmailShell } from "@/lib/email-template";
import { stripHtml } from "@/lib/rich-text";
import { isValidEmail } from "@/lib/validation";
import { trackingTagger } from "@/lib/email-images";

/**
 * eventbuddy's own email campaigns (platform admins only, migration 0141):
 * who a campaign goes to and what the email looks like. Organizer blasts are a
 * separate feature (audience/blast) that stays as it was.
 */

export type EventSegment = "registered" | "checked_in" | "no_show" | "started_not_bought";
export type CampaignAudience = { kind: "list"; listId: string } | { kind: "event"; eventId: string; segment: EventSegment };
export type Recipient = { email: string; fullName: string };

export const AudienceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("list"), listId: z.string().uuid() }),
  z.object({ kind: z.literal("event"), eventId: z.string().uuid(), segment: z.enum(["registered", "checked_in", "no_show", "started_not_bought"]) }),
]);

/** The unsubscribe "organization" for eventbuddy's own campaigns: the
 *  unsubscribe route files these under platform_email_suppressions. */
export const PLATFORM_UNSUBSCRIBE_SCOPE = "eventbuddy";

export const SEGMENT_LABEL: Record<EventSegment, string> = {
  registered: "Registered",
  checked_in: "Checked in",
  no_show: "Didn't show up",
  started_not_bought: "Started but didn't buy",
};

function addRecipient(map: Map<string, Recipient>, email: string | null | undefined, fullName: string | null | undefined) {
  const e = (email ?? "").trim().toLowerCase();
  if (!e || !isValidEmail(e) || map.has(e)) return;
  map.set(e, { email: e, fullName: (fullName ?? "").trim() });
}

/** Everyone a campaign would reach, deduplicated and sorted by email (a stable
 *  order, so a send can be split into chunks by offset), minus everyone who
 *  unsubscribed from eventbuddy, and for an event, from that organizer. */
export async function resolveAudience(
  admin: SupabaseClient,
  audience: CampaignAudience
): Promise<{ recipients: Recipient[]; label: string } | { error: string }> {
  const people = new Map<string, Recipient>();
  let label = "";
  let orgId: string | null = null;

  if (audience.kind === "list") {
    const { data: list } = await admin.from("platform_contact_lists").select("id, name").eq("id", audience.listId).maybeSingle();
    if (!list) return { error: "That list couldn't be found." };
    label = `List: ${list.name}`;
    const { data, error } = await fetchAllRows((from, to) =>
      admin.from("platform_contacts").select("email, full_name").eq("list_id", list.id).order("id").range(from, to)
    );
    if (error) return { error: error.message };
    for (const c of data as { email: string; full_name: string | null }[]) addRecipient(people, c.email, c.full_name);
  } else {
    const { data: event } = await admin
      .from("events")
      .select("id, name, organization_id, date, end_date, start_time, end_time, timezone, event_format")
      .eq("id", audience.eventId)
      .maybeSingle();
    if (!event) return { error: "That event couldn't be found." };
    orgId = event.organization_id;
    label = `${event.name}: ${SEGMENT_LABEL[audience.segment]}`;
    const virtual = event.event_format === "virtual";
    const ended = getEventStatus({ date: event.date, endDate: event.end_date ?? undefined, startTime: event.start_time ?? undefined, endTime: event.end_time ?? undefined, timezone: event.timezone ?? undefined }) === "completed";

    if (audience.segment === "no_show" && !ended) return { error: "Didn't show up can only be targeted once the event has ended." };
    if (virtual && (audience.segment === "checked_in" || audience.segment === "no_show")) {
      return { error: "Online events have no check-in, so only Registered and Started but didn't buy apply." };
    }

    // Everyone who holds a place (any of these statuses) counts as "bought"
    const placeHolders = new Set<string>();
    const regs = await fetchAllRows((from, to) =>
      admin.from("registrations").select("email, full_name, status, checked_in_at").eq("event_id", event.id).order("id").range(from, to)
    );
    if (regs.error) return { error: regs.error.message };
    const leads = virtual
      ? await fetchAllRows((from, to) => admin.from("leads").select("email, first_name, last_name, status").eq("event_id", event.id).order("id").range(from, to))
      : { data: [] as { email: string; first_name: string; last_name: string; status: string }[], error: null };
    if (leads.error) return { error: leads.error.message };

    for (const r of regs.data as { email: string; full_name: string; status: string; checked_in_at: string | null }[]) {
      if (["registered", "checked_in", "pending", "waitlisted"].includes(r.status)) placeHolders.add(r.email.toLowerCase());
      if (audience.segment === "registered" && (r.status === "registered" || r.status === "checked_in")) addRecipient(people, r.email, r.full_name);
      if (audience.segment === "checked_in" && r.status === "checked_in") addRecipient(people, r.email, r.full_name);
      if (audience.segment === "no_show" && r.status === "registered" && !r.checked_in_at) addRecipient(people, r.email, r.full_name);
    }
    for (const l of leads.data as { email: string; first_name: string; last_name: string; status: string }[]) {
      if (l.status === "registered") placeHolders.add(l.email.toLowerCase());
      if (audience.segment === "registered" && l.status === "registered") addRecipient(people, l.email, `${l.first_name} ${l.last_name}`);
    }

    if (audience.segment === "started_not_bought") {
      // typed their email into the form (registration_form_starts) or went to
      // Paystack and didn't pay (a checkout still pending, or failed)
      const starts = await fetchAllRows((from, to) =>
        admin.from("registration_form_starts").select("email, full_name").eq("event_id", event.id).order("id").range(from, to)
      );
      if (starts.error) return { error: starts.error.message };
      const checkouts = await fetchAllRows((from, to) =>
        admin
          .from("paystack_transactions")
          .select("registrant_data")
          .eq("event_id", event.id)
          .eq("purpose", "ticket_purchase")
          .in("status", ["pending", "failed"])
          .order("id")
          .range(from, to)
      );
      if (checkouts.error) return { error: checkouts.error.message };
      const maybe = new Map<string, Recipient>();
      for (const s of starts.data as { email: string; full_name: string | null }[]) addRecipient(maybe, s.email, s.full_name);
      for (const c of checkouts.data as { registrant_data: { email?: string; firstName?: string; lastName?: string } | null }[]) {
        addRecipient(maybe, c.registrant_data?.email, `${c.registrant_data?.firstName ?? ""} ${c.registrant_data?.lastName ?? ""}`);
      }
      for (const [email, r] of maybe) if (!placeHolders.has(email)) people.set(email, r);
    }
  }

  const [{ data: platformOut }, orgOut] = await Promise.all([
    admin.from("platform_email_suppressions").select("email"),
    orgId ? admin.from("organization_email_suppressions").select("email").eq("organization_id", orgId) : Promise.resolve({ data: [] as { email: string }[] }),
  ]);
  const unsubscribed = new Set([...(platformOut ?? []), ...(orgOut.data ?? [])].map((s) => s.email.toLowerCase()));
  const recipients = [...people.values()].filter((r) => !unsubscribed.has(r.email)).sort((a, b) => a.email.localeCompare(b.email));
  return { recipients, label };
}

/** The utm_campaign value for a campaign: event_visits.campaign and the
 *  attribution on registrations/payments carry it, which is how a campaign's
 *  clicks and ticket sales are counted (platform_campaign_results). */
export function campaignTrackingTag(campaignId: string): string {
  return `eb-${campaignId}`;
}

/** An eventbuddy campaign email: greeting, the admin's message, an optional
 *  button, and an unsubscribe line. Pictures must already be hosted
 *  (hostInlineImages); links to eventbuddy are tagged with the campaign. */
export function buildCampaignEmail(
  to: Recipient,
  c: { id: string; subject: string; messageHtml: string; ctaLabel?: string | null; ctaUrl?: string | null },
  unsubUrl: string
) {
  const tag = trackingTagger({ source: "email", campaign: campaignTrackingTag(c.id) });
  const firstName = to.fullName.split(/\s+/)[0] || "";
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hi there,";
  const greetingText = firstName ? `Hi ${firstName},` : "Hi there,";
  const ctaUrl = c.ctaUrl ? tag.url(c.ctaUrl) : null;
  const ctaHtml = c.ctaLabel && ctaUrl ? `<div style="margin-top:24px;">${emailButton(escapeHtml(ctaUrl), escapeHtml(c.ctaLabel), "#C21FAF")}</div>` : "";
  const html = `
    <p style="margin:0 0 4px; font-weight:600; color:#1e1b2e;">${greeting}</p>
    <div style="color:#333;">${tag.html(c.messageHtml)}</div>
    ${ctaHtml}
    <p style="margin:24px 0 0; padding-top:16px; border-top:1px solid #eee; font-size:11px; color:#aaa;">
      You're receiving this from eventbuddy. <a href="${unsubUrl}" style="color:#aaa;">Unsubscribe</a>
    </p>
  `;
  return {
    from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
    to: to.email,
    subject: c.subject,
    text: `${greetingText}\n\n${stripHtml(c.messageHtml)}${c.ctaLabel && ctaUrl ? `\n\n${c.ctaLabel}: ${ctaUrl}` : ""}\n\nUnsubscribe: ${unsubUrl}`,
    html: renderEmailShell({ color: "#C21FAF", label: "eventbuddy", emoji: "📣" }, html),
    headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}
