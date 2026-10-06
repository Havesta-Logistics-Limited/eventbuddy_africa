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
  return NextResponse.json({ success: true });
}
