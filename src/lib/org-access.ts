import type { SupabaseClient } from "@supabase/supabase-js";

export type OrgAccess = {
  id: string;
  slug: string;
  role: "admin" | "event_support";
  /** Set only for an event_support member — the one event they may act on. */
  eventId?: string;
};

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
  if (ownedOrg) return { id: ownedOrg.id, slug: ownedOrg.slug, role: "admin" };

  const { data: org } = await supabase.from("organizations").select("id, slug").ilike("slug", orgSlug).maybeSingle();
  if (!org) return null;

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role, event_id")
    .eq("organization_id", org.id)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) return null;

  return { id: org.id, slug: org.slug, role: membership.role as "admin" | "event_support", eventId: membership.event_id ?? undefined };
}
