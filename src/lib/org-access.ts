import type { SupabaseClient } from "@supabase/supabase-js";
import { canEdit, canView, parsePermissions, type TeamPermissions, type TeamSection } from "@/lib/team-permissions";

export type OrgAccess = {
  id: string;
  slug: string;
  role: "admin" | "event_support";
  /** Set only for an event_support member — the one event they may act on. */
  eventId?: string;
  /** the organization's owner: everything, plus team, bank account and payouts */
  isOwner: boolean;
  /** team members' access per page (migration 0137); unset for the owner */
  permissions?: TeamPermissions;
};

/** May this signed-in user read (edit = false) or change (edit = true) this page's data? */
export function orgCan(access: OrgAccess, section: TeamSection, edit: boolean): boolean {
  return edit ? canEdit(access.permissions, section) : canView(access.permissions, section);
}

/**
 * Resolves which organization (if any) a signed-in dashboard user may act on for
 * `orgSlug`, checking ownership first, then an active invited membership — the
 * same precedence as finishAdminLogin (store.ts) uses to build the session in the
 * first place. Callers that operate on one specific event must additionally check
 * `access.role !== "event_support" || access.eventId === thatEventId` before
 * proceeding, since this alone only proves org-level access.
 */
export async function resolveOrgAccess(supabase: SupabaseClient, userId: string, orgSlug: string): Promise<OrgAccess | null> {
  const { data: ownedOrg } = await supabase.from("organizations").select("id, slug").eq("owner_user_id", userId).ilike("slug", orgSlug).maybeSingle();
  if (ownedOrg) return { id: ownedOrg.id, slug: ownedOrg.slug, role: "admin", isOwner: true };

  const { data: org } = await supabase.from("organizations").select("id, slug").ilike("slug", orgSlug).maybeSingle();
  if (!org) return null;

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role, event_id, permissions")
    .eq("organization_id", org.id)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) return null;

  const role = membership.role as "admin" | "event_support";
  return { id: org.id, slug: org.slug, role, eventId: membership.event_id ?? undefined, isOwner: false, permissions: parsePermissions(membership.permissions, role) };
}

/** May this user change (edit = true) or read this event's data under `section`?
 *  For routes that are handed an event-scoped row id rather than an org slug:
 *  RLS reads pass at view level since 0137, so a SELECT through the user's
 *  client proves too little before a service-role write. */
export async function canAccessEvent(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  userId: string,
  eventId: string,
  section: TeamSection,
  edit: boolean
): Promise<boolean> {
  const { data: event } = await admin.from("events").select("id, organizations(slug)").eq("id", eventId).maybeSingle();
  const slug = (event?.organizations as unknown as { slug: string } | null)?.slug;
  if (!slug) return false;
  const access = await resolveOrgAccess(supabase, userId, slug);
  if (!access || !orgCan(access, section, edit)) return false;
  return access.role !== "event_support" || access.eventId === eventId;
}
