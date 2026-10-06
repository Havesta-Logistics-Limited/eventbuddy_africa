import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { nairaToChargeAmount, paystackInitialize } from "@/lib/paystack";
import { requireOrgOwner } from "@/lib/plan-owner";
import { newId } from "@/lib/utils";

const Schema = z.object({ planId: z.enum(["grow", "scale"]) });

/** Starts the Paystack checkout for a paid organizer plan. The first payment
 *  also creates the monthly subscription (the plan code on initialize). */
export async function POST(request: Request) {
  const auth = await requireOrgOwner(request);
  if ("response" in auth) return auth.response;
  const parsed = Schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Choose Grow or Scale." }, { status: 400 });
  const { user, org } = auth;

  const admin = createAdminClient();
  const { data: plan } = await admin.from("organizer_plans").select("id, name, price_monthly_naira, paystack_plan_code").eq("id", parsed.data.planId).maybeSingle();
  if (!plan) return NextResponse.json({ error: "That plan doesn't exist." }, { status: 404 });
  if (!plan.paystack_plan_code || !(Number(plan.price_monthly_naira) > 0)) {
    return NextResponse.json({ error: `${plan.name} isn't available to buy yet. Contact eventbuddy to switch plans.` }, { status: 409 });
  }
  if (org.paystack_subscription_code && org.plan_status !== "cancelling") {
    return NextResponse.json({ error: "Cancel your current plan before switching to another one." }, { status: 409 });
  }
  if (!user.email) return NextResponse.json({ error: "Your account has no email for the receipt." }, { status: 400 });

  const reference = newId("plan");
  const { currency, amountMinor } = nairaToChargeAmount(Number(plan.price_monthly_naira));
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const { error } = await admin.from("paystack_transactions").insert({
    organization_id: org.id,
    event_id: null,
    reference,
    amount_naira: Number(plan.price_monthly_naira),
    charge_currency: currency,
    charge_amount_minor: amountMinor,
    purpose: "subscription",
    plan_id: plan.id,
    registrant_data: { email: user.email },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const { authorizationUrl } = await paystackInitialize({
      email: user.email,
      amountMinor,
      reference,
      currency,
      plan: plan.paystack_plan_code,
      callbackUrl: `${siteUrl}/admin?tab=plan&reference=${encodeURIComponent(reference)}`,
      metadata: { organizationId: org.id, planId: plan.id, purpose: "subscription" },
    });
    return NextResponse.json({ authorizationUrl });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't start payment." }, { status: 502 });
  }
}
