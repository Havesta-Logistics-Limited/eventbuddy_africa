import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";

type LookupBody = { email?: string; referenceId?: string };

/**
 * Resolves an attendee's own hub_token from something they'd actually remember —
 * their email, or (for a physical event) their reference ID — so a generic,
 * shareable per-event QR/link (no token baked in) can still get them into their
 * own Hub without digging up the original confirmation email. Backs the "Enter
 * your email or reference ID" fallback on the Hub page when it's opened without
 * a token.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/hub/lookup">) {
  const { slug, eventId } = await ctx.params;
  const body = (await request.json()) as Partial<LookupBody>;
  const email = body.email?.trim().toLowerCase();
  const referenceId = body.referenceId?.trim().toUpperCase();

  if (!email && !referenceId) {
    return NextResponse.json({ error: "Enter your email or reference ID." }, { status: 400 });
  }

  if (!(await checkRateLimit(`hub-lookup:ip:${clientIp(request)}`, 15, 10 * 60))) {
    return rateLimitedResponse();
  }

  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("id").ilike("slug", slug).maybeSingle();
  if (!org) return NextResponse.json({ error: "No organization found for that link." }, { status: 404 });

  let resolvedEmail = email;
  if (!resolvedEmail && referenceId) {
    const { data: registration } = await admin.from("registrations").select("email").eq("event_id", eventId).eq("reference_id", referenceId).maybeSingle();
    if (!registration) {
      return NextResponse.json({ error: "We couldn't find a registration matching that reference ID for this event." }, { status: 404 });
    }
    resolvedEmail = registration.email.toLowerCase();
  }

  const { data: member } = await admin
    .from("event_hub_members")
    .select("hub_token")
    .eq("event_id", eventId)
    .eq("organization_id", org.id)
    .ilike("email", resolvedEmail!)
    .maybeSingle();
  if (!member) {
    return NextResponse.json({ error: "We couldn't find a registration matching that for this event." }, { status: 404 });
  }

  return NextResponse.json({ token: member.hub_token });
}
