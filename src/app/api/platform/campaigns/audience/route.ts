import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AudienceSchema, resolveAudience } from "@/lib/platform-campaigns";

/** How many people an audience would reach right now (after unsubscribes). */
export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if ("response" in auth) return auth.response;
  const parsed = AudienceSchema.safeParse((await request.json().catch(() => null))?.audience);
  if (!parsed.success) return NextResponse.json({ error: "Choose who to send to." }, { status: 400 });
  const result = await resolveAudience(createAdminClient(), parsed.data);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ count: result.recipients.length, label: result.label });
}
