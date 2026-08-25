import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";

/**
 * Names only, any published event ever (past or upcoming) — backs the marketing
 * homepage's "Events powered by eventbuddy" marquee. Deliberately separate from
 * /api/orgs/[slug]/events (public_org_events), which excludes completed events on
 * purpose for the operational staff/rep/registration pickers it serves; reusing
 * that same query here is exactly what made the marquee go empty and disappear
 * once the featured org's events all finished. See 0037_marquee_hosted_events.sql.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/orgs/[slug]/hosted-events">) {
  const { slug } = await ctx.params;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !url.startsWith("http")) {
    return NextResponse.json({ names: [] });
  }

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("public_org_hosted_event_names", { org_slug: slug });
  if (error) return NextResponse.json({ names: [] });

  const names = Array.from(new Set(((data ?? []) as { name: string }[]).map((r) => r.name)));
  return NextResponse.json({ names });
}
