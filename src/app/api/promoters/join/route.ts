import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePromoter } from "@/lib/promoter-auth";
import { addPromoterToEvent } from "@/lib/promoter-referral";
import { meetsVerified, promoterLink, promoterTourLink, type PromoterBadge } from "@/lib/promoters";

const Schema = z.object({ eventId: z.string().uuid() });

/** A promoter joins an open event from the marketplace and gets their link. */
export async function POST(request: Request) {
  const auth = await requirePromoter(request);
  if ("response" in auth) return auth.response;
  const parsed = Schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid event." }, { status: 400 });

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select("id, slug, organization_id, tour_id, published, promoter_program_enabled, promoter_access, promoter_commission_pct, organizations(slug)")
    .eq("id", parsed.data.eventId)
    .maybeSingle();
  if (!event?.published || !event.promoter_program_enabled) return NextResponse.json({ error: "This event isn't taking promoters." }, { status: 404 });
  if (event.promoter_access === "invite") return NextResponse.json({ error: "This event is invite only. The organizer adds promoters by handle." }, { status: 403 });
  // Seller badge or higher (migration 0106), from real attributed sales
  let verified: boolean | null = null;
  const isVerified = async () => {
    if (verified === null) {
      const { data: stats } = await admin.rpc("_promoter_stats", { p_promoter: auth.promoter.id }).maybeSingle<{ badge: PromoterBadge | null }>();
      verified = meetsVerified(stats?.badge);
    }
    return verified;
  };
  if (event.promoter_access === "verified") {
    if (!(await isVerified())) {
      return NextResponse.json({ error: "This event is for verified promoters: you need the Seller badge (10 tickets sold) or higher." }, { status: 403 });
    }
  }

  const result = await addPromoterToEvent(admin, event, auth.promoter);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const orgSlug = (event.organizations as unknown as { slug: string } | null)?.slug ?? "";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;

  // One of a tour's cities: join every other city that takes promoters on the
  // same terms, so the one tour link earns wherever the buyer picks.
  let tourLink: string | null = null;
  let tourCities = 0;
  if (event.tour_id) {
    const [{ data: tour }, { data: siblings }] = await Promise.all([
      admin.from("tours").select("slug").eq("id", event.tour_id).maybeSingle(),
      admin
        .from("events")
        .select("id, organization_id, published, promoter_program_enabled, promoter_access, promoter_commission_pct")
        .eq("tour_id", event.tour_id)
        .neq("id", event.id),
    ]);
    for (const s of siblings ?? []) {
      if (!s.published || !s.promoter_program_enabled || s.promoter_access === "invite") continue;
      if (s.promoter_access === "verified" && !(await isVerified())) continue;
      const r = await addPromoterToEvent(admin, s, auth.promoter);
      if (r.ok) tourCities++;
    }
    if (tour) tourLink = promoterTourLink(siteUrl, { orgSlug, tourSlug: tour.slug }, auth.promoter.handle);
  }

  return NextResponse.json({
    success: true,
    link: promoterLink(siteUrl, { slug: event.slug, orgSlug, eventId: event.id }, auth.promoter.handle),
    tourLink,
    tourCities: tourCities + (event.tour_id ? 1 : 0),
  });
}
