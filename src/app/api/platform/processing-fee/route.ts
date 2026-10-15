import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-auth";

const Schema = z.object({
  enabled: z.boolean(),
  percentage: z.number().min(0).max(10),
  flatNaira: z.number().min(0).max(10_000),
  flatWaivedBelowNaira: z.number().min(0).max(1_000_000),
  capNaira: z.number().min(0).max(100_000),
});

/** Buyer-paid card processing (migration 0130): on/off, and Paystack's rate it
 *  passes on, so it can be matched to the account's actual pricing. */
export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if ("response" in auth) return auth.response;
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the processing fee settings and try again." }, { status: 400 });
  const p = parsed.data;
  const { error } = await createAdminClient()
    .from("platform_settings")
    .update({
      buyer_pays_processing: p.enabled,
      processing_fee_percentage: p.percentage,
      processing_fee_flat_naira: p.flatNaira,
      processing_fee_flat_waived_below_naira: p.flatWaivedBelowNaira,
      processing_fee_cap_naira: p.capNaira,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
