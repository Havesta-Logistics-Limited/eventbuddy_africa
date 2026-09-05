import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { zonedTimeToUtc } from "@/lib/capture-window";
import { sendEventReminderEmail, type ReminderKind } from "@/lib/registration-email";
import { hubUrl as buildHubUrl } from "@/lib/event-hub";

// Half the hourly cron cadence plus a buffer — wide enough that a single tick
// always lands inside the window for whichever stage is due, without ever
// catching the same stage on two consecutive ticks (each stage's own
// reminder_*_sent_at column is the real dedupe guarantee either way).
const TOLERANCE_MS = 35 * 60 * 1000;

function inWindow(target: number, now: number) {
  return Math.abs(now - target) <= TOLERANCE_MS;
}

type Attendee = {
  id: string;
  email: string;
  full_name: string;
  reminder_24h_sent_at: string | null;
  reminder_dayof_sent_at: string | null;
  reminder_1h_sent_at: string | null;
};

/**
 * netlify/functions/event-reminders-cron.mts hits this hourly. Sends up to 3
 * automatic reminders per registration/lead — 24h before, the morning of (8am
 * in the event's own timezone), and 1h before — mirroring the rsvp-reminders
 * cron's idempotency pattern but with 3 independent tracked stages instead of
 * one, since these fire on 3 different schedules per event.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const tomorrow = new Date(now + 86400000).toISOString().slice(0, 10);

  const { data: events, error: eventsError } = await admin
    .from("events")
    .select("id, slug, name, date, start_time, end_time, timezone, event_format, virtual_join_url, virtual_platform, virtual_access_notes, venue, location, organization_id")
    .eq("published", true)
    .gte("date", today)
    .lte("date", tomorrow);
  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 });
  if (!events || events.length === 0) return NextResponse.json({ success: true, reminded: 0 });

  const orgIds = Array.from(new Set(events.map((e) => e.organization_id)));
  const { data: orgs } = await admin.from("organizations").select("id, slug").in("id", orgIds);
  const slugByOrgId = new Map((orgs ?? []).map((o) => [o.id, o.slug]));

  let reminded = 0;

  for (const event of events) {
    const eventStart = zonedTimeToUtc(event.date, event.start_time || "09:00", event.timezone ?? undefined).getTime();
    const dayOfTarget = zonedTimeToUtc(event.date, "08:00", event.timezone ?? undefined).getTime();

    const due: { kind: ReminderKind; column: "reminder_24h_sent_at" | "reminder_dayof_sent_at" | "reminder_1h_sent_at" }[] = [];
    if (inWindow(eventStart - 24 * 3600000, now)) due.push({ kind: "24h", column: "reminder_24h_sent_at" });
    if (dayOfTarget < eventStart && inWindow(dayOfTarget, now)) due.push({ kind: "dayof", column: "reminder_dayof_sent_at" });
    if (inWindow(eventStart - 3600000, now)) due.push({ kind: "1h", column: "reminder_1h_sent_at" });
    if (due.length === 0) continue;

    const orgSlug = slugByOrgId.get(event.organization_id);

    for (const { kind, column } of due) {
      const [regRes, leadRes] = await Promise.all([
        admin
          .from("registrations")
          .select("id, email, full_name, reminder_24h_sent_at, reminder_dayof_sent_at, reminder_1h_sent_at")
          .eq("event_id", event.id)
          .in("status", ["registered", "checked_in"])
          .is(column, null),
        admin
          .from("leads")
          .select("id, email, first_name, last_name, reminder_24h_sent_at, reminder_dayof_sent_at, reminder_1h_sent_at")
          .eq("event_id", event.id)
          .eq("status", "registered")
          .is(column, null),
      ]);

      const attendees: { table: "registrations" | "leads"; row: Attendee }[] = [
        ...(regRes.data ?? []).map((r) => ({ table: "registrations" as const, row: r as Attendee })),
        ...(leadRes.data ?? []).map((l) => ({
          table: "leads" as const,
          row: { ...l, full_name: `${l.first_name} ${l.last_name}`.trim() } as unknown as Attendee,
        })),
      ];

      for (const { table, row } of attendees) {
        let hub: string | undefined;
        if (orgSlug) {
          const { data: member } = await admin.from("event_hub_members").select("hub_token").eq("event_id", event.id).eq("email", row.email).maybeSingle();
          if (member) {
            const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
            hub = buildHubUrl(siteUrl, orgSlug, event, member.hub_token);
          }
        }
        const sent = await sendEventReminderEmail(row.email, event, kind, hub);
        if (sent) {
          await admin.from(table).update({ [column]: new Date().toISOString() }).eq("id", row.id);
          reminded++;
        }
      }
    }
  }

  return NextResponse.json({ success: true, reminded });
}
