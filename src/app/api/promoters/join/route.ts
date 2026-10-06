import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePromoter } from "@/lib/promoter-auth";
import { addPromoterToEvent } from "@/lib/promoter-referral";
import { meetsVerified, promoterLink, type PromoterBadge } from "@/lib/promoters";

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
    .select("id, slug, organization_id, published, promoter_program_enabled, promoter_access, promoter_commission_pct, organizations(slug)")
    .eq("id", parsed.data.eventId)
    .maybeSingle();
  if (!event?.published || !event.promoter_program_enabled) return NextResponse.json({ error: "This event isn't taking promoters." }, { status: 404 });
  if (event.promoter_access === "invite") return NextResponse.json({ error: "This event is invite only. The organizer adds promoters by handle." }, { status: 403 });
  if (event.promoter_access === "verified") {
    // Seller badge or higher (migration 0106), from real attributed sales
    const { data: stats } = await admin.rpc("_promoter_stats", { p_promoter: auth.promoter.id }).maybeSingle<{ badge: PromoterBadge | null }>();
    if (!meetsVerified(stats?.badge)) {
      return NextResponse.json({ error: "This event is for verified promoters: you need the Seller badge (10 tickets sold) or higher." }, { status: 403 });
    }
  }

  const result = await addPromoterToEvent(admin, event, auth.promoter);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const orgSlug = (event.organizations as unknown as { slug: string } | null)?.slug ?? "";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  return NextResponse.json({ success: true, link: promoterLink(siteUrl, { slug: event.slug, orgSlug, eventId: event.id }, auth.promoter.handle) });
}
