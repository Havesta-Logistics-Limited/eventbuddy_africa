import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const Schema = z.object({ password: z.string().min(1) });

/**
 * Queues account deletion for platform-admin approval rather than deleting
 * immediately — same request/approve shape as an org name or login email
 * change (see /api/platform/approve-account-deletion). Still checks the
 * password here, not just trusting the client's confirm-text prompt, since
 * this is the entry point to the app's single most destructive action.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter your password." }, { status: 400 });

  const supabase = await createServerClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (!caller?.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Stateless client (no cookie persistence) purely to verify the password —
  // doesn't touch the caller's actual session cookies.
  const verifier = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: authError } = await verifier.auth.signInWithPassword({ email: caller.email, password: parsed.data.password });
  if (authError) return NextResponse.json({ error: "Incorrect password." }, { status: 400 });

  // organizations_update_own already scopes this update to the caller's own org.
  const { error: updateError } = await supabase
    .from("organizations")
    .update({ account_deletion_status: "requested", account_deletion_requested_at: new Date().toISOString() })
    .eq("owner_user_id", caller.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
