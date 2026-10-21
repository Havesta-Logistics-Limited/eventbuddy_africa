import type { SupabaseClient } from "@supabase/supabase-js";
import { parseInviteDesign, type InviteDesign } from "@/lib/invite-design";

/**
 * A guest's invitation by their private invite token (migration 0136). The
 * token (a random uuid, sent only to that guest) is the access check, the
 * same as the RSVP link. Only confirmed guests have an entry QR.
 */
export type InviteLookup = {
  guestName: string;
  referenceId: string | null;
  design: InviteDesign | null;
  event: { id: string; name: string; date: string; start_time: string | null; venue: string; location: string; published: boolean };
  orgName: string;
};

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function lookupInvite(admin: SupabaseClient, token: string): Promise<InviteLookup | null> {
  if (!TOKEN.test(token)) return null;
  const { data: guest } = await admin
    .from("event_guests")
    .select("full_name, status, registration_id, event_id, events(id, name, date, start_time, venue, location, published, invite_design, organizations(name, is_suspended))")
    .eq("invite_token", token)
    .maybeSingle();
  if (!guest) return null;
  const ev = guest.events as unknown as {
    id: string; name: string; date: string; start_time: string | null; venue: string; location: string; published: boolean; invite_design: unknown;
    organizations: { name: string; is_suspended: boolean } | null;
  } | null;
  if (!ev || ev.organizations?.is_suspended) return null;
  let referenceId: string | null = null;
  if (guest.status === "accepted" && guest.registration_id) {
    const { data: reg } = await admin.from("registrations").select("reference_id, status").eq("id", guest.registration_id).maybeSingle();
    if (reg && reg.status !== "cancelled" && reg.status !== "declined") referenceId = reg.reference_id;
  }
  return {
    guestName: guest.full_name,
    referenceId,
    design: parseInviteDesign(ev.invite_design),
    event: { id: ev.id, name: ev.name, date: ev.date, start_time: ev.start_time, venue: ev.venue, location: ev.location, published: ev.published },
    orgName: ev.organizations?.name ?? "",
  };
}
