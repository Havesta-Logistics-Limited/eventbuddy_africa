import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const CreateAdminSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

/**
 * Creates a brand-new Supabase Auth account and grants it platform admin access in
 * one step — distinct from add_platform_admin (the RPC used elsewhere), which only
 * grants access to an account that already exists. Only reachable by an existing
 * platform admin: the caller's session is checked against platform_admins with the
 * cookie-bound, RLS-respecting server client before any service-role write happens.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = CreateAdminSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input." }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const supabase = await createServerClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (!caller) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { data: membership } = await supabase.from("platform_admins").select("user_id").eq("user_id", caller.id).maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "Only platform admins can create other platform admin accounts." }, { status: 403 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY === "paste_your_supabase_service_role_key_here") {
    return NextResponse.json({ error: "Not configured yet. Add real Supabase keys to .env.local and restart the dev server." }, { status: 500 });
  }

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message || "Couldn't create that account." }, { status: 400 });
  }

  const { error: grantError } = await admin.from("platform_admins").insert({ user_id: created.user.id, email });
  if (grantError) {
    // Roll back the auth user so a failed grant doesn't leave an orphaned, unlisted account.
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: grantError.message || "Couldn't grant platform admin access." }, { status: 500 });
  }

  return NextResponse.json({ success: true, userId: created.user.id, email });
}
