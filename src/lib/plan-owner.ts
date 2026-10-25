import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { resolveRouteUser } from "@/lib/supabase/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type OwnedOrg = {
  id: string;
  name: string;
  plan_id: string;
  plan_status: string;
  plan_comped: boolean;
  plan_period_end: string | null;
  paystack_subscription_code: string | null;
  paystack_subscription_token: string | null;
};

/** The signed-in organization OWNER and their org: plans are billing, so
 *  invited admins can see the plan but only the owner can change it. */
export async function requireOrgOwner(request: Request): Promise<{ user: User; org: OwnedOrg } | { response: NextResponse }> {
  const { user, supabase } = await resolveRouteUser(request);
  if (!user) return { response: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  // the lookup below uses the service role, which skips the database's own
  // two-factor rule, so it's checked here
  const { data: aalOk } = await supabase.rpc("has_required_aal");
  if (aalOk !== true) return { response: NextResponse.json({ error: "Confirm your two-factor code to continue." }, { status: 403 }) };
  const { data: org } = await createAdminClient()
    .from("organizations")
    .select("id, name, plan_id, plan_status, plan_comped, plan_period_end, paystack_subscription_code, paystack_subscription_token")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!org) return { response: NextResponse.json({ error: "Only the organization owner can change the plan." }, { status: 403 }) };
  return { user, org: org as OwnedOrg };
}
