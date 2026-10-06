import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-auth";

const Schema = z.object({
  heldFundsEnabled: z.boolean(),
  payoutMinNaira: z.number().min(0).max(100_000_000),
  payoutFeeNaira: z.number().min(0).max(1_000_000),
  unverifiedLockDays: z.number().int().min(0).max(60),
});

/** Held-funds switch and payout rules (migration 0102). Turning holding on
 *  records the moment, so it's clear which sales went through the ledger. */
export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if ("response" in auth) return auth.response;
  const parsed = Schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Check the payout settings and try again." }, { status: 400 });
  const { heldFundsEnabled, payoutMinNaira, payoutFeeNaira, unverifiedLockDays } = parsed.data;

  const admin = createAdminClient();
  const { data: current } = await admin.from("platform_settings").select("held_funds_enabled, held_funds_since").eq("id", true).maybeSingle();
  const { error } = await admin
    .from("platform_settings")
    .update({
      held_funds_enabled: heldFundsEnabled,
      held_funds_since: heldFundsEnabled && !current?.held_funds_enabled ? new Date().toISOString() : current?.held_funds_since ?? null,
      payout_min_naira: payoutMinNaira,
      payout_fee_naira: payoutFeeNaira,
      unverified_lock_days: unverifiedLockDays,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
