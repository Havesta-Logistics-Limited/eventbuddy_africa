import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";

type OrgEventRow = {
  id: string;
  slug: string | null;
  name: string;
  date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string;
  venue: string;
  description: string | null;
  cover_image: string | null;
  event_format: string | null;
  virtual_platform: string | null;
};

/**
 * Backs the public /[orgSlug] profile page — organization name/bio and every
 * publicly reachable event they've run, past and upcoming. No session, no rate
 * limiting (pure read, same as /api/events/discover). See public_organization_profile
 * and public_organization_events (0062) for the actual visibility rules.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/orgs/[slug]/public-profile">) {
  const { slug } = await ctx.params;
  const supabase = createAnonClient();

  const { data: orgRows, error: orgError } = await supabase.rpc("public_organization_profile", { org_slug: slug });
  if (orgError) return NextResponse.json({ error: orgError.message }, { status: 500 });
  const org = (orgRows ?? [])[0] as { id: string; name: string; slug: string; bio: string | null; logo_url: string | null; is_verified: boolean } | undefined;
  if (!org) return NextResponse.json({ error: "This organizer couldn't be found." }, { status: 404 });

  const { data: eventsData } = await supabase.rpc("public_organization_events", { org_slug: slug });
  const events = (eventsData ?? []) as OrgEventRow[];
  const eventIds = events.map((e) => e.id);

  let priceByEventId = new Map<string, number>();
  if (eventIds.length > 0) {
    const { data: priceData } = await supabase.rpc("public_event_ticket_price_ranges", { p_event_ids: eventIds });
    priceByEventId = new Map((priceData ?? []).map((p: { event_id: string; min_price_naira: number }) => [p.event_id, Number(p.min_price_naira)]));
  }

  return NextResponse.json({
    organization: { name: org.name, slug: org.slug, bio: org.bio ?? "", logoUrl: org.logo_url ?? undefined, isVerified: org.is_verified },
    events: events.map((e) => ({
      id: e.id,
      slug: e.slug ?? undefined,
      name: e.name,
      date: e.date,
      endDate: e.end_date ?? undefined,
      startTime: e.start_time ?? undefined,
      endTime: e.end_time ?? undefined,
      location: e.location,
      venue: e.venue,
      description: e.description ?? "",
      coverImage: e.cover_image ?? undefined,
      eventFormat: (e.event_format as "physical" | "virtual" | null) ?? "physical",
      virtualPlatform: e.virtual_platform ?? undefined,
      minPriceNaira: priceByEventId.has(e.id) ? priceByEventId.get(e.id) : null,
    })),
  });
}
