import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Public check for the register page's post-registration "Book a 1-on-1" step — no
 * session required. Purely a yes/no on whether the organizer has this on for a
 * published event; there's no speaker or slot data to return since this is just an
 * interest flag (see event_one_on_one_requests, migration 0058).
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/one-on-one">) {
  const { slug, eventId } = await ctx.params;
  const admin = createAdminClient();

  const { data: org } = await admin.from("organizations").select("id").ilike("slug", slug).maybeSingle();
  if (!org) return NextResponse.json({ error: "No organization found for that link." }, { status: 404 });

  const { data: event } = await admin.from("events").select("published, one_on_one_enabled").eq("id", eventId).eq("organization_id", org.id).maybeSingle();
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });

  return NextResponse.json({ enabled: !!(event.published && event.one_on_one_enabled) });
}
