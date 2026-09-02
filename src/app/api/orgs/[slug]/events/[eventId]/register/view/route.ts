import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";

/**
 * Fire-and-forget hit counter for the public registration page — called once
 * on mount by the register page itself. Best-effort: a failure here must
 * never surface to the visitor or affect registration in any way.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/register/view">) {
  const { slug, eventId } = await ctx.params;

  if (!(await checkRateLimit(`register-view:ip:${clientIp(request)}`, 60, 10 * 60))) {
    return rateLimitedResponse();
  }

  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("id").ilike("slug", slug).maybeSingle();
  if (!org) return NextResponse.json({ error: "No organization found for that link." }, { status: 404 });

  const { data: event } = await admin.from("events").select("id").eq("id", eventId).eq("organization_id", org.id).maybeSingle();
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  await admin.rpc("increment_registration_page_views", { p_event_id: eventId });
  return NextResponse.json({ success: true });
}
