import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { disablePaystackSubscription } from "@/lib/paystack";
import { requireOrgOwner } from "@/lib/plan-owner";

/** Stops a paid plan renewing. The organization keeps it until the period
 *  they've paid for ends, then drops back to Launch. */
export async function POST(request: Request) {
  const auth = await requireOrgOwner(request);
  if ("response" in auth) return auth.response;
  const { org } = auth;
  if (org.plan_id === "launch") return NextResponse.json({ error: "You're on Launch already." }, { status: 400 });
  if (org.plan_comped) return NextResponse.json({ error: "Your plan was set by eventbuddy. Contact us to change it." }, { status: 409 });
  if (org.plan_status === "cancelling") return NextResponse.json({ error: "Your plan is already set to end." }, { status: 400 });

  if (org.paystack_subscription_code && org.paystack_subscription_token) {
    try {
      await disablePaystackSubscription(org.paystack_subscription_code, org.paystack_subscription_token);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't cancel the subscription." }, { status: 502 });
    }
  }
  const { error } = await createAdminClient().from("organizations").update({ plan_status: "cancelling" }).eq("id", org.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, endsAt: org.plan_period_end });
}
