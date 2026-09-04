import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Public "Hosted By" social-proof numbers for the register page — a real count and
 * a bounded sample of real attendee names (never the full list; see
 * public_event_attendee_summary, migration 0060). Uses the service-role client for
 * the org/event lookups (organizations and events have no anon SELECT policy, same
 * as every other public event route in this app), then the security-definer RPC for
 * the actual counts, which is the same data an in-person attendee would already see
 * at check-in — just surfaced before the event too.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/attendee-summary">) {
  const { slug, eventId } = await ctx.params;
  const admin = createAdminClient();

  const { data: org } = await admin.from("organizations").select("id").ilike("slug", slug).maybeSingle();
  if (!org) return NextResponse.json({ error: "No organization found for that link." }, { status: 404 });

  const { data: event } = await admin.from("events").select("id").eq("id", eventId).eq("organization_id", org.id).maybeSingle();
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });

  const { data, error } = await admin
    .rpc("public_event_attendee_summary", { p_event_id: eventId })
    .maybeSingle<{ total_count: number; sample_names: string[] }>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ totalCount: data?.total_count ?? 0, sampleNames: data?.sample_names ?? [] });
}
