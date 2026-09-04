import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";

/**
 * Resolves a global event slug (migration 0057) to its owning organization — the one
 * thing /discover/[slug] needs before it can reuse the existing org-scoped reads
 * (/api/orgs/[slug]/events, etc.) for everything else, same as
 * /[orgSlug]/events/[eventId]/register already does once it has an org slug.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/events/by-slug/[slug]">) {
  const { slug } = await ctx.params;
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("public_event_by_slug", { p_slug: slug }).maybeSingle<{ event_id: string; org_slug: string }>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });
  return NextResponse.json({ orgSlug: data.org_slug, eventId: data.event_id });
}
