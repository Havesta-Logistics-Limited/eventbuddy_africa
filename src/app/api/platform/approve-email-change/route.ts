import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const Schema = z.object({ orgId: z.string().uuid() });

/**
 * Applies a requested login-email change (see Settings' "Login email" section) —
 * unlike an org name change, the value actually being changed lives in
 * auth.users, not a plain organizations column, so this can't be a direct client
 * update the way approveNameChange is: only the service role can call
 * auth.admin.updateUserById. email_confirm: true skips Supabase's own
 * confirmation-email step, since a platform admin approving this IS the
 * verification step — sending a confirmation to the new address and waiting on
 * it would just be a second, redundant check.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
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
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select("id, owner_user_id, pending_login_email, login_email_change_status")
    .eq("id", orgId)
    .maybeSingle();
  if (orgError || !org) return NextResponse.json({ error: orgError?.message || "Organization not found." }, { status: 404 });
  if (org.login_email_change_status !== "requested" || !org.pending_login_email) {
    return NextResponse.json({ error: "No pending email change for this organization." }, { status: 400 });
  }

  const { error: updateAuthError } = await admin.auth.admin.updateUserById(org.owner_user_id, { email: org.pending_login_email, email_confirm: true });
  if (updateAuthError) return NextResponse.json({ error: updateAuthError.message }, { status: 500 });

  const { error: updateOrgError } = await admin
    .from("organizations")
    .update({ pending_login_email: null, login_email_change_status: "none" })
    .eq("id", orgId);
  if (updateOrgError) return NextResponse.json({ error: updateOrgError.message }, { status: 500 });

  return NextResponse.json({ success: true, newEmail: org.pending_login_email });
}
