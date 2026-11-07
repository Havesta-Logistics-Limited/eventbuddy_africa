import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";

/** Signed-in platform admin, or the response to return instead. Same check as
 *  the older /api/platform routes, shared by the payout routes. */
export async function requirePlatformAdmin(): Promise<{ userId: string } | { response: NextResponse }> {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  // A slow or unreachable sign-in service isn't the same as being signed out:
  // say so, so the admin retries instead of signing in again for nothing.
  if (!user && error && error.name !== "AuthSessionMissingError" && (error.status === undefined || error.status === 0 || error.status >= 500)) {
    return { response: NextResponse.json({ error: "Couldn't reach the sign-in service. Try again in a moment." }, { status: 503 }) };
  }
  if (!user) return { response: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  const { data: membership } = await supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!membership) return { response: NextResponse.json({ error: "Only platform admins can do this." }, { status: 403 }) };
  return { userId: user.id };
}
