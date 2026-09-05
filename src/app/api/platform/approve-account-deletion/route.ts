import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const Schema = z.object({ orgId: z.string().uuid() });

/**
 * Carries out a requested self-service account deletion (see Settings' "Delete
 * account" section) — deleting the owner's auth user cascades to their
 * organization row, and everything under it, via organizations.owner_user_id's
 * on delete cascade, the same mechanism /api/platform/delete-org uses for a
 * platform-admin-initiated deletion. Only acts on orgs actually flagged
 * "requested" so this can't be pointed at an arbitrary org id.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid organization id." }, { status: 400 });
  }
  const { orgId } = parsed.data;

  const supabase = await createServerClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: membership } = await supabase.from("platform_admins").select("user_id").eq("user_id", caller.id).maybeSingle();
  if (!membership) return NextResponse.json({ error: "Only platform admins can do this." }, { status: 403 });

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY === "paste_your_supabase_service_role_key_here") {
    return NextResponse.json({ error: "Not configured yet." }, { status: 500 });
  }

  const admin = createAdminClient();
  const { data: org, error: orgError } = await admin.from("organizations").select("owner_user_id, account_deletion_status").eq("id", orgId).maybeSingle();
  if (orgError || !org) return NextResponse.json({ error: orgError?.message || "Organization not found." }, { status: 404 });
  if (org.account_deletion_status !== "requested") {
    return NextResponse.json({ error: "No pending deletion request for this organization." }, { status: 400 });
  }

  // organization_members.user_id is `on delete set null`, not cascade — clean up
  // this owner's own membership rows explicitly rather than leaving them orphaned.
  await admin.from("organization_members").delete().eq("user_id", org.owner_user_id);

  const { error: deleteError } = await admin.auth.admin.deleteUser(org.owner_user_id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message || "Couldn't delete this account." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
