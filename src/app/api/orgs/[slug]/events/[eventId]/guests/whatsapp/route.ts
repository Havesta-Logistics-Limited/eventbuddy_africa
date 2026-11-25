import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { orgCan, resolveOrgAccess } from "@/lib/org-access";
import { inviteMessage, perRunLimit, queueWhatsApp, whatsappAllowedFor } from "@/lib/whatsapp";

const BodySchema = z.object({ guestIds: z.array(z.string().uuid()).max(2000).optional() });

async function access(slug: string, eventId: string, edit: boolean) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  const org = await resolveOrgAccess(supabase, user.id, slug);
  if (!org) return { error: NextResponse.json({ error: "Not authorized for this organization." }, { status: 403 }) };
  if (org.role === "event_support" && org.eventId !== eventId) return { error: NextResponse.json({ error: "Not authorized for this event." }, { status: 403 }) };
  if (!orgCan(org, "events", edit)) return { error: NextResponse.json({ error: "You have view-only access to events." }, { status: 403 }) };
  return { user, org };
}

/** How the event's WhatsApp invitations are going (migration 0146). */
export async function GET(_request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/guests/whatsapp">) {
  const { slug, eventId } = await ctx.params;
  const a = await access(slug, eventId, false);
  if ("error" in a) return a.error;
  const enabled = whatsappAllowedFor({ id: a.org.id, slug });
  if (!enabled) return NextResponse.json({ enabled: false });

  const admin = createAdminClient();
  const { data: rows } = await admin.from("whatsapp_outbox").select("status, guest_id").eq("event_id", eventId).eq("organization_id", a.org.id).eq("kind", "invite");
  const counts = { queued: 0, sent: 0, failed: 0, skipped: 0 };
  const byGuest: Record<string, string> = {};
  for (const r of rows ?? []) {
    const s = r.status === "sending" ? "queued" : (r.status as keyof typeof counts);
    counts[s]++;
    if (r.guest_id) byGuest[r.guest_id] = s;
  }
  return NextResponse.json({ enabled: true, perMinute: perRunLimit(), counts, byGuest });
}

/**
 * Queues each confirmed guest's flyer (their QR on the organizer's design) to
 * go out from the eventbuddy WhatsApp number, a couple a minute. Guests with
 * no phone, already queued or sent are left out; the Flyer/WhatsApp buttons
 * and email still work for them as before.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/guests/whatsapp">) {
  const { slug, eventId } = await ctx.params;
  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid guest list." }, { status: 400 });

  const a = await access(slug, eventId, true);
  if ("error" in a) return a.error;
  if (!(await checkRateLimit(`guest-whatsapp:user:${a.user.id}`, 30, 10 * 60))) return rateLimitedResponse();
  if (!whatsappAllowedFor({ id: a.org.id, slug })) return NextResponse.json({ error: "Automatic WhatsApp isn't switched on for your account yet." }, { status: 403 });

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select("id, name, date, start_time, end_time, venue, location, event_format, invite_design, organizations(name)")
    .eq("id", eventId)
    .eq("organization_id", a.org.id)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });
  if (event.event_format === "virtual" || !event.invite_design) return NextResponse.json({ error: "Design your invitation flyer first." }, { status: 400 });
  const orgName = (event.organizations as unknown as { name: string } | null)?.name ?? "";

  let query = admin.from("event_guests").select("id, full_name, phone, invite_token").eq("event_id", eventId).eq("organization_id", a.org.id).eq("status", "accepted").not("phone", "is", null);
  if (parsed.data.guestIds?.length) query = query.in("id", parsed.data.guestIds);
  const { data: guests } = await query;
  const ready = (guests ?? []).filter((g) => g.phone && g.invite_token);
  if (ready.length === 0) return NextResponse.json({ queued: 0, message: "No confirmed guests with a phone number to send to." });

  const site = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const queued = await queueWhatsApp(
    admin,
    ready.map((g) => ({
      kind: "invite" as const,
      dedupe_key: `invite:${g.id}`,
      to_phone: g.phone!,
      body: inviteMessage(g.full_name, event, orgName),
      image_kind: "invite_flyer" as const,
      fallback_text: `Your invitation: ${site}/i/${g.invite_token}`,
      organization_id: a.org.id,
      event_id: eventId,
      guest_id: g.id,
      priority: 5,
    })),
  );
  const minutes = Math.ceil(queued / perRunLimit());
  return NextResponse.json({ queued, alreadyQueued: ready.length - queued, minutes });
}
