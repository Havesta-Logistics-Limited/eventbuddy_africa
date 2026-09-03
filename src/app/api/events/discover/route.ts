import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";

type DiscoverEventRow = {
  id: string;
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
  org_name: string;
  org_slug: string;
};

/**
 * Every currently-active, self-service-registerable event across every
 * organization — powers the public "Discover" page. No session, no
 * rate limiting (pure read, no side effect, same as public_org_events'
 * other callers) — see public_discover_events for the actual filtering
 * (published, not suspended, not invite-only, self-registration enabled,
 * not yet ended).
 */
export async function GET() {
  const supabase = createAnonClient();

  const { data: eventsData, error: eventsError } = await supabase.rpc("public_discover_events");
  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 });

  const events = (eventsData ?? []) as DiscoverEventRow[];
  const eventIds = events.map((e) => e.id);

  let priceByEventId = new Map<string, number>();
  if (eventIds.length > 0) {
    const { data: priceData } = await supabase.rpc("public_event_ticket_price_ranges", { p_event_ids: eventIds });
    priceByEventId = new Map((priceData ?? []).map((p: { event_id: string; min_price_naira: number }) => [p.event_id, Number(p.min_price_naira)]));
  }

  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
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
      orgName: e.org_name,
      orgSlug: e.org_slug,
      minPriceNaira: priceByEventId.has(e.id) ? priceByEventId.get(e.id) : null,
    })),
  });
}
