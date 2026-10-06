import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { upsertPaystackPlan } from "@/lib/paystack";

const Save = z.object({
  action: z.literal("save"),
  planId: z.enum(["launch", "grow", "scale"]),
  priceMonthlyNaira: z.number().min(0).max(100_000_000),
  feePercentage: z.number().min(0).max(100).nullable(),
  feeFlatNaira: z.number().min(0).max(1_000_000).nullable(),
  maxPromotersPerEvent: z.number().int().min(0).max(100_000).nullable(),
  // create/update the matching Paystack plan so organizers can subscribe
  syncPaystack: z.boolean(),
});
const Assign = z.object({
  action: z.literal("assign"),
  orgId: z.string().uuid(),
  planId: z.enum(["launch", "grow", "scale"]),
});

/** Platform admin: edit the plans, publish them to Paystack, or put an
 *  organization on a plan without payment (comped). */
export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if ("response" in auth) return auth.response;
  const body = await request.json();
  const admin = createAdminClient();

  const assign = Assign.safeParse(body);
  if (assign.success) {
    const { orgId, planId } = assign.data;
    const { error } = await admin
      .from("organizations")
      .update({ plan_id: planId, plan_status: "active", plan_comped: planId !== "launch", plan_period_end: null })
      .eq("id", orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  const save = Save.safeParse(body);
  if (!save.success) return NextResponse.json({ error: "Check the plan details and try again." }, { status: 400 });
  const p = save.data;
  if (p.planId === "launch" && p.priceMonthlyNaira > 0) return NextResponse.json({ error: "Launch is the free plan." }, { status: 400 });

  const { data: current } = await admin.from("organizer_plans").select("name, paystack_plan_code").eq("id", p.planId).maybeSingle();
  if (!current) return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  let planCode = current.paystack_plan_code;
  if (p.syncPaystack && p.planId !== "launch" && p.priceMonthlyNaira > 0) {
    try {
      planCode = await upsertPaystackPlan({ code: planCode, name: current.name, amountMinor: Math.round(p.priceMonthlyNaira * 100) });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Paystack couldn't save this plan." }, { status: 502 });
    }
  }
  const { error } = await admin
    .from("organizer_plans")
    .update({
      price_monthly_naira: p.planId === "launch" ? 0 : p.priceMonthlyNaira,
      fee_percentage: p.planId === "launch" ? null : p.feePercentage,
      fee_flat_naira: p.planId === "launch" ? null : p.feeFlatNaira,
      max_promoters_per_event: p.maxPromotersPerEvent,
      paystack_plan_code: planCode,
      updated_at: new Date().toISOString(),
    })
    .eq("id", p.planId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, paystackPlanCode: planCode });
}
