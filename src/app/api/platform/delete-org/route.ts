import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DeleteOrgSchema = z.object({ orgId: z.string().uuid() });

/**
 * Deletes an organization AND its owner's auth account — not just the org row.
 * supabase.rpc("delete_organization", ...) (0015_platform_admin_delete_org.sql)
 * deliberately only deleted the org row, leaving the owner's login intact; that
 * turned out to be the wrong default (it silently blocks that email from ever
 * signing up again). Deleting the auth user here cascades to the organization row
 * — and everything under it — via organizations.owner_user_id's existing
 * `on delete cascade`, so this is a superset of what the RPC did.
 *
 * Only reachable by an existing platform admin, same auth-check pattern as
 * /api/platform/create-admin.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = DeleteOrgSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid organization id." }, { status: 400 });
  }
  const { orgId } = parsed.data;

  const supabase = await createServerClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (!caller) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { data: membership } = await supabase.from("platform_admins").select("user_id").eq("user_id", caller.id).maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "Only platform admins can delete an organization." }, { status: 403 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY === "paste_your_supabase_service_role_key_here") {
    return NextResponse.json({ error: "Not configured yet." }, { status: 500 });
  }

  const admin = createAdminClient();
  const { data: org, error: orgError } = await admin.from("organizations").select("owner_user_id").eq("id", orgId).maybeSingle();
  if (orgError) return NextResponse.json({ error: orgError.message }, { status: 500 });
  if (!org) return NextResponse.json({ success: true }); // already gone — nothing to do

  const { error: deleteError } = await admin.auth.admin.deleteUser(org.owner_user_id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message || "Couldn't delete that organization." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
