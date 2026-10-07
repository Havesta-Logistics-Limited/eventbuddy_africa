import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Public: an event's exhibitor page data (safe columns only), by event slug
 *  or id. `enabled: false` when the event isn't taking exhibitors. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  const eventId = url.searchParams.get("eventId");
  if (!slug && !eventId) return NextResponse.json({ enabled: false }, { status: 400 });
  const admin = createAdminClient();
  let q = admin
    .from("events")
    .select("id, slug, name, date, start_time, venue, location, cover_image, published, exhibitors_enabled, exhibitor_intro, exhibitor_deadline, organizations(name, slug, is_suspended)");
  q = slug ? q.eq("slug", slug) : q.eq("id", eventId!);
  const { data: e } = await q.maybeSingle();
  const org = e?.organizations as unknown as { name: string; slug: string; is_suspended: boolean } | null;
  if (!e?.published || !e.exhibitors_enabled || org?.is_suspended) return NextResponse.json({ enabled: false });
  const closed = !!e.exhibitor_deadline && new Date(`${e.exhibitor_deadline}T23:59:59`) < new Date();
  const { data: stands } = await admin.rpc("stand_availability", { p_event_id: e.id });
  return NextResponse.json({
    enabled: true,
    closed,
    event: { id: e.id, slug: e.slug, name: e.name, date: e.date, startTime: e.start_time, venue: e.venue, location: e.location, coverImage: e.cover_image, intro: e.exhibitor_intro, deadline: e.exhibitor_deadline },
    organizer: org?.name ?? "",
    stands: ((stands ?? []) as { id: string; name: string; description: string | null; price_naira: number; quantity: number | null; taken: number }[]).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      priceNaira: Number(s.price_naira),
      left: s.quantity == null ? null : Math.max(0, s.quantity - s.taken),
    })),
  });
}
