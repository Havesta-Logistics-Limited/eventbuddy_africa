import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Flips a pending organization_members row to active once the invited user has
 * set their password (see acceptInvite in store.ts). Uses the admin client for
 * the write rather than adding a new self-service RLS policy — a pending
 * member has no RLS access of their own yet, so this one narrow, server-checked
 * transition (their own row, and only while still pending) is simpler and
 * safer than opening that up.
 */
export async function POST() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_members")
    .update({ status: "active", accepted_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "No pending invite found for this account." }, { status: 404 });

  return NextResponse.json({ success: true });
}
