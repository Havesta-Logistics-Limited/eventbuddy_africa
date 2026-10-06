import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";

/** Signed-in platform admin, or the response to return instead. Same check as
 *  the older /api/platform routes, shared by the payout routes. */
export async function requirePlatformAdmin(): Promise<{ userId: string } | { response: NextResponse }> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  const { data: membership } = await supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!membership) return { response: NextResponse.json({ error: "Only platform admins can do this." }, { status: 403 }) };
  return { userId: user.id };
}
