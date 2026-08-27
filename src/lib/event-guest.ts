import type { SupabaseClient } from "@supabase/supabase-js";

export function guestRsvpUrl(siteUrl: string, orgSlug: string, eventId: string, token: string): string {
  return `${siteUrl}/${orgSlug}/events/${eventId}/rsvp?token=${encodeURIComponent(token)}`;
}

/**
 * Resolves an org slug + invite_token into the guest row it belongs to — the shared
 * trust boundary for the public RSVP page and its submit route, same model as
 * verifyHubMember for the Event Hub. Returns null on any mismatch rather than
 * throwing, so callers can respond with a uniform 403/404 without distinguishing
 * "no such org" from "wrong token."
 */
export async function verifyEventGuest(
  admin: SupabaseClient,
  params: { slug: string; eventId: string; token: string }
): Promise<{
  organizationId: string;
  guestId: string;
  fullName: string;
  email: string;
  status: string;
  plusOnesAllowed: number;
  plusOnesConfirmed: number | null;
} | null> {
  const { data: org } = await admin.from("organizations").select("id").ilike("slug", params.slug).maybeSingle();
  if (!org) return null;

  const { data: guest } = await admin
    .from("event_guests")
    .select("id, full_name, email, status, plus_ones_allowed, plus_ones_confirmed")
    .eq("event_id", params.eventId)
    .eq("organization_id", org.id)
    .eq("invite_token", params.token)
    .maybeSingle();
  if (!guest) return null;

  return {
    organizationId: org.id,
    guestId: guest.id,
    fullName: guest.full_name,
    email: guest.email,
    status: guest.status,
    plusOnesAllowed: guest.plus_ones_allowed,
    plusOnesConfirmed: guest.plus_ones_confirmed,
  };
}
