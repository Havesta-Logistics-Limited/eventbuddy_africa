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

export function hubUrl(siteUrl: string, orgSlug: string, eventId: string, hubToken: string): string {
  return `${siteUrl}/${orgSlug}/events/${eventId}/hub?token=${encodeURIComponent(hubToken)}`;
}
