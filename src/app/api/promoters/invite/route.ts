import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveRouteUser } from "@/lib/supabase/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { addPromoterToEvent } from "@/lib/promoter-referral";
import { normalizeHandle } from "@/lib/promoters";

const Schema = z.object({ eventId: z.string().uuid(), handle: z.string().min(1).max(30) });

/** An organizer adds a promoter to their event by handle (the only way onto
 *  an invite-only event). Ownership is checked with the organizer's own
 *  session: the event must be one RLS lets them read. */
export async function POST(request: Request) {
  const { user, supabase } = await resolveRouteUser(request);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const parsed = Schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter a promoter handle." }, { status: 400 });

  const { data: event } = await supabase.from("events").select("id, organization_id, promoter_program_enabled, promoter_commission_pct").eq("id", parsed.data.eventId).maybeSingle();
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const { data: owns } = await supabase.rpc("owned_organization_ids");
  if (!(owns as string[] | null)?.includes(event.organization_id)) return NextResponse.json({ error: "Only the event's organizer can invite promoters." }, { status: 403 });
  if (!event.promoter_program_enabled) return NextResponse.json({ error: "Turn on promoter payouts for this event first." }, { status: 400 });

  const admin = createAdminClient();
  const handle = normalizeHandle(parsed.data.handle);
  const { data: promoter } = await admin.from("promoters").select("id, handle, full_name, email, phone, is_suspended").ilike("handle", handle).maybeSingle();
  if (!promoter || promoter.is_suspended) return NextResponse.json({ error: `No promoter found with the handle @${handle}.` }, { status: 404 });

  const result = await addPromoterToEvent(admin, event, promoter);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, promoter: { handle: promoter.handle, fullName: promoter.full_name } });
}
