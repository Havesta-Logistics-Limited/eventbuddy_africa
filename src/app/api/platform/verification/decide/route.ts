import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { emailOrganizerDecision } from "@/lib/verification";

const Schema = z.object({ requestId: z.string().uuid(), action: z.enum(["approve", "decline"]), reason: z.string().trim().max(500).optional() });

/** A platform admin approves (verifies the organizer) or declines a request. */
export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if ("response" in auth) return auth.response;
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { requestId, action, reason } = parsed.data;
  if (action === "decline" && !reason) return NextResponse.json({ error: "Tell the organizer why, so they can fix it." }, { status: 400 });

  const admin = createAdminClient();
  const { data: req } = await admin.from("organizer_verification_requests").select("id, status, organization_id, organizations(name, email)").eq("id", requestId).maybeSingle();
  if (!req) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  if (req.status !== "pending") return NextResponse.json({ error: "This request has already been decided." }, { status: 409 });
  const now = new Date().toISOString();

  const { error } = await admin
    .from("organizer_verification_requests")
    .update({ status: action === "approve" ? "approved" : "declined", decline_reason: action === "decline" ? reason : null, decided_at: now, decided_by: auth.userId })
    .eq("id", requestId)
    .eq("status", "pending");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (action === "approve") {
    const { error: e2 } = await admin.from("organizations").update({ payout_verified: true, payout_verified_at: now }).eq("id", req.organization_id);
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    // their risk alerts are settled by the verification
    await admin.from("risk_alerts").update({ resolved_at: now, resolved_by: auth.userId }).eq("organization_id", req.organization_id).is("resolved_at", null);
  }
  const org = req.organizations as unknown as { name: string; email: string | null } | null;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const emailed = org?.email ? await emailOrganizerDecision(org.email, org.name, action === "approve", reason ?? null, siteUrl) : false;
  return NextResponse.json({ success: true, emailed });
}
