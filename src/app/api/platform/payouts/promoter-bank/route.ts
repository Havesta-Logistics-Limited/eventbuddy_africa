import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-auth";

const Schema = z.object({ promoterId: z.string().uuid(), action: z.enum(["approve", "decline"]) });

/** Approves (or declines) a promoter's request to change their payout bank
 *  account. Approval only unlocks the change; the promoter re-enters the new
 *  account themselves, verified against the bank. */
export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if ("response" in auth) return auth.response;
  const parsed = Schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  const { error } = await createAdminClient()
    .from("promoters")
    .update({ payout_change_status: parsed.data.action === "approve" ? "approved" : "none" })
    .eq("id", parsed.data.promoterId)
    .eq("payout_change_status", "requested");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
