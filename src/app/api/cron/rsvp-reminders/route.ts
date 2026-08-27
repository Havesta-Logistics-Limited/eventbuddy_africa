import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendGuestReminderEmail } from "@/lib/guest-invite-email";
import { guestRsvpUrl } from "@/lib/event-guest";

const REMINDER_WINDOW_DAYS = 3;

/**
 * netlify/functions/rsvp-reminders-cron.mts hits this daily to nudge invited
 * guests who still haven't responded as their event approaches. Exactly one
 * reminder per guest ever, tracked via reminder_sent_at (unlike the draft-
 * reminders cron, which relies on its 30-minute cadence for "once per cycle" —
 * this one only fires daily, so it needs its own explicit dedupe). Guarded by
 * CRON_SECRET so it can't be triggered by anyone who finds the URL.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const windowEnd = new Date(Date.now() + REMINDER_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const { data: guests, error } = await admin
    .from("event_guests")
    .select("id, full_name, email, event_id, organization_id, invite_token")
    .eq("status", "pending")
    .not("invited_at", "is", null)
    .is("reminder_sent_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!guests || guests.length === 0) return NextResponse.json({ success: true, reminded: 0 });

  const eventIds = Array.from(new Set(guests.map((g) => g.event_id)));
  const { data: events, error: eventsError } = await admin
    .from("events")
    .select("id, name, date, start_time, end_time, event_format, virtual_join_url, virtual_platform, virtual_access_notes, venue, location, published, organization_id")
    .in("id", eventIds)
    .eq("published", true)
    .gte("date", today)
    .lte("date", windowEnd);
  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 });
  if (!events || events.length === 0) return NextResponse.json({ success: true, reminded: 0 });

  const orgIds = Array.from(new Set(events.map((e) => e.organization_id)));
  const { data: orgs, error: orgsError } = await admin.from("organizations").select("id, slug").in("id", orgIds);
  if (orgsError) return NextResponse.json({ error: orgsError.message }, { status: 500 });
  const slugByOrgId = new Map((orgs || []).map((o) => [o.id, o.slug]));

  const eventsById = new Map(events.map((e) => [e.id, e]));
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  let reminded = 0;

  for (const guest of guests) {
    const event = eventsById.get(guest.event_id);
    if (!event) continue;
    const slug = slugByOrgId.get(guest.organization_id);
    if (!slug) continue;

    const rsvpUrl = guestRsvpUrl(siteUrl, slug, guest.event_id, guest.invite_token);
    const sent = await sendGuestReminderEmail(guest.email, guest.full_name, event, rsvpUrl);
    if (sent) {
      await admin.from("event_guests").update({ reminder_sent_at: new Date().toISOString() }).eq("id", guest.id);
      reminded++;
    }
  }

  return NextResponse.json({ success: true, reminded, candidates: guests.length });
}
