import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

const Schema = z.object({ orgId: z.string().uuid() });

/**
 * The one place a real, unmasked bank account number is ever fetched — on
 * demand, for a single org, only when a platform admin explicitly asks. The
 * bulk org list (organizations_payout_masked) never carries the real value at
 * all, so this is the only path to it. Uses the RLS-respecting server client,
 * not the service-role client: is_platform_admin() already grants this read
 * on the base table, so no elevated access is needed, only the auth check.
 */
export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const supabase = await createServerClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: membership } = await supabase.from("platform_admins").select("user_id").eq("user_id", caller.id).maybeSingle();
  if (!membership) return NextResponse.json({ error: "Only platform admins can do this." }, { status: 403 });

  if (!(await checkRateLimit(`reveal-payout:user:${caller.id}`, 30, 10 * 60))) {
    return rateLimitedResponse();
  }

  const { data: org, error } = await supabase.from("organizations").select("payout_account_number").eq("id", parsed.data.orgId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!org) return NextResponse.json({ error: "Organization not found." }, { status: 404 });

  return NextResponse.json({ accountNumber: org.payout_account_number });
}
