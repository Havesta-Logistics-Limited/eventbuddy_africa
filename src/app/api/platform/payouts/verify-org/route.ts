import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-auth";

const Schema = z.object({ orgId: z.string().uuid(), verified: z.boolean() });

/** Payout verification: a verified organizer can withdraw cleared money from
 *  a live event instead of waiting until after it ends. */
export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if ("response" in auth) return auth.response;
  const parsed = Schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  const { error } = await createAdminClient()
    .from("organizations")
    .update({ payout_verified: parsed.data.verified, payout_verified_at: parsed.data.verified ? new Date().toISOString() : null })
    .eq("id", parsed.data.orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (parsed.data.verified) {
    // verifying from the switch settles any open request and risk alerts too (0118)
    const now = new Date().toISOString();
    const admin = createAdminClient();
    await admin.from("organizer_verification_requests").update({ status: "approved", decided_at: now, decided_by: auth.userId }).eq("organization_id", parsed.data.orgId).eq("status", "pending");
    await admin.from("risk_alerts").update({ resolved_at: now, resolved_by: auth.userId }).eq("organization_id", parsed.data.orgId).is("resolved_at", null);
  }
  return NextResponse.json({ success: true });
}
