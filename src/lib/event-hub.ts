import type { SupabaseClient } from "@supabase/supabase-js";
import { newId } from "@/lib/utils";

/**
 * Ensures an event_hub_members row exists for this attendee and returns its
 * hub_token — called from both registration paths (free self-registration and paid
 * ticket-purchase fulfillment) right where they already create the registrations/
 * leads row, so Hub access is automatic and never a separate step for the attendee.
 * Idempotent: inserts a fresh token, and on a (event_id, email) conflict (e.g. the
 * same person registering again, or a webhook/callback race finalizing the same
 * purchase twice) falls back to the token already on file rather than issuing a
 * second one — every email that attendee ever gets must link to the same Hub.
 */
export async function ensureHubMember(
  admin: SupabaseClient,
  params: { organizationId: string; eventId: string; email: string; fullName: string }
): Promise<{ hubToken: string }> {
  const hubToken = newId("hub");
  const { error: insertError } = await admin.from("event_hub_members").insert({
    organization_id: params.organizationId,
    event_id: params.eventId,
    email: params.email,
    full_name: params.fullName,
    hub_token: hubToken,
  });
  if (!insertError) return { hubToken };

  const { data: existing, error: selectError } = await admin
    .from("event_hub_members")
    .select("hub_token")
    .eq("event_id", params.eventId)
    .eq("email", params.email)
    .single();
  if (selectError || !existing) throw new Error(selectError?.message || "Couldn't set up event hub access.");
  return { hubToken: existing.hub_token };
}

/** Uses the event's own slug when it has one — shorter and readable, same
 *  reasoning as the register and check-in links — falling back to the raw id
 *  for an event with none. verifyHubMember below resolves either form back to
 *  the real event, so an already-mailed id-based Hub link keeps working. */
export function hubUrl(siteUrl: string, orgSlug: string, event: { id: string; slug?: string | null }, hubToken: string): string {
  return `${siteUrl}/${orgSlug}/events/${event.slug || event.id}/hub?token=${encodeURIComponent(hubToken)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves an org slug + hub_token into the member row it belongs to — the shared
 * trust-boundary check for every attendee-facing Hub action (submitting a
 * question, upvoting, voting in a poll, bookmarking a session). Returns null on any
 * mismatch rather than throwing, so callers can respond with a uniform 403 without
 * distinguishing "no such org" from "wrong token" — that distinction isn't useful
 * to an attacker probing this endpoint, and isn't needed by a legitimate caller
 * either (they either have their own real link, or they don't). `eventId` may be
 * a real id or the event's slug (see hubUrl) — resolved here once, and the real
 * id is returned so callers never need to re-resolve it for their own queries
 * against event_sessions/event_questions/etc., whose event_id columns are
 * always the real uuid, never a slug.
 */
export async function verifyHubMember(
  admin: SupabaseClient,
  params: { slug: string; eventId: string; token: string }
): Promise<{ organizationId: string; eventId: string; memberId: string; fullName: string; email: string } | null> {
  const { data: org } = await admin.from("organizations").select("id").ilike("slug", params.slug).maybeSingle();
  if (!org) return null;

  const { data: event } = UUID_RE.test(params.eventId)
    ? await admin.from("events").select("id").eq("organization_id", org.id).eq("id", params.eventId).maybeSingle()
    : await admin.from("events").select("id").eq("organization_id", org.id).eq("slug", params.eventId).maybeSingle();
  if (!event) return null;

  const { data: member } = await admin
    .from("event_hub_members")
    .select("id, full_name, email")
    .eq("event_id", event.id)
    .eq("organization_id", org.id)
    .eq("hub_token", params.token)
    .maybeSingle();
  if (!member) return null;

  return { organizationId: org.id, eventId: event.id, memberId: member.id, fullName: member.full_name, email: member.email };
}
