import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { resolveOrgAccess } from "@/lib/org-access";
import { generateReferenceId } from "@/lib/utils";

const BodySchema = z.object({ guestIds: z.array(z.string().uuid()).min(1).max(500) });

/**
 * Confirms imported guests straight away (migration 0136): each gets their own
 * registration, and so their entry QR, without having to RSVP; the organizer
 * vouches for the list. The same record an accepted RSVP creates (linked by
 * guest_invite_id), so the door scanner, guest list and exports all work as
 * before. Idempotent: a guest already confirmed keeps their registration.
 * Nothing is emailed here; invitations go out with Send.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/guests/confirm">) {
  const { slug, eventId } = await ctx.params;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Select at least one guest." }, { status: 400 });

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!(await checkRateLimit(`guest-confirm:user:${user.id}`, 60, 10 * 60))) return rateLimitedResponse();

  const org = await resolveOrgAccess(supabase, user.id, slug);
  if (!org) return NextResponse.json({ error: "Not authorized for this organization." }, { status: 403 });
  if (org.role === "event_support" && org.eventId !== eventId) return NextResponse.json({ error: "Not authorized for this event." }, { status: 403 });

  const admin = createAdminClient();
  const { data: event } = await admin.from("events").select("id, organization_id, is_invite_only, event_format").eq("id", eventId).eq("organization_id", org.id).maybeSingle();
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });
  if (!event.is_invite_only) return NextResponse.json({ error: "This event isn't set to invite-only." }, { status: 400 });
  if (event.event_format === "virtual") return NextResponse.json({ error: "Confirming guests with a QR is for in-person events." }, { status: 400 });

  const { data: guests } = await admin
    .from("event_guests")
    .select("id, full_name, email, phone, status, registration_id")
    .eq("event_id", eventId)
    .eq("organization_id", org.id)
    .in("id", parsed.data.guestIds);

  let confirmed = 0;
  const failed: string[] = [];
  for (const g of guests ?? []) {
    let registrationId: string | null = g.registration_id;
    if (!registrationId) {
      const { data: existing } = await admin.from("registrations").select("id").eq("guest_invite_id", g.id).order("created_at").limit(1).maybeSingle();
      registrationId = existing?.id ?? null;
    }
    for (let attempt = 0; attempt < 5 && !registrationId; attempt++) {
      const { data, error } = await admin
        .from("registrations")
        .insert({
          organization_id: org.id,
          event_id: eventId,
          reference_id: generateReferenceId(),
          full_name: g.full_name,
          email: g.email,
          phone: g.phone || null,
          custom_answers: {},
          guest_invite_id: g.id,
        })
        .select("id")
        .single();
      if (data) registrationId = data.id;
      else if (error?.code !== "23505") break;
    }
    if (!registrationId) {
      failed.push(g.full_name);
      continue;
    }
    await admin
      .from("event_guests")
      .update({ status: "accepted", registration_id: registrationId, responded_at: new Date().toISOString() })
      .eq("id", g.id);
    confirmed++;
  }

  return NextResponse.json({
    success: true,
    confirmed,
    ...(failed.length ? { error: `Couldn't confirm ${failed.length} guest${failed.length === 1 ? "" : "s"}: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""}. Try again.` } : {}),
  });
}
