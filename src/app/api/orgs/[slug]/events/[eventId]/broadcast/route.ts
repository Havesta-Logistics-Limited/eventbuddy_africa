import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBroadcastEmail, BROADCAST_RECIPIENT_CAP } from "@/lib/broadcast-email";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { stripHtml } from "@/lib/rich-text";

type Body = { subject?: string; body?: string };

/**
 * Organizer-authored email to every confirmed attendee of one event — the
 * Announcements tab already posts a one-way update to the public Event Hub (see
 * addAnnouncement in store.ts), but that's pull-based: an attendee only sees it if
 * they open the Hub link again. This pushes the same kind of update straight to
 * inboxes instead. Deliberately capped at BROADCAST_RECIPIENT_CAP recipients and
 * rate-limited hard (5/hour) — a broadcast tool is also, structurally, a spam tool
 * if left unbounded.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/broadcast">) {
  const { slug, eventId } = await ctx.params;
  const body = (await request.json().catch(() => null)) as Body | null;
  const subject = body?.subject?.trim();
  const message = body?.body?.trim();
  if (!message || !stripHtml(message).trim()) return NextResponse.json({ error: "Write something to send." }, { status: 400 });

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!(await checkRateLimit(`broadcast:user:${user.id}`, 5, 60 * 60))) {
    return rateLimitedResponse();
  }

  const { data: org } = await supabase.from("organizations").select("id").eq("owner_user_id", user.id).ilike("slug", slug).maybeSingle();
  if (!org) return NextResponse.json({ error: "Not authorized for this organization." }, { status: 403 });

  const { data: event } = await supabase.from("events").select("id, name").eq("id", eventId).eq("organization_id", org.id).maybeSingle();
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });

  const admin = createAdminClient();
  const [{ data: registrations }, { data: leads }] = await Promise.all([
    admin.from("registrations").select("email").eq("event_id", event.id).eq("organization_id", org.id).in("status", ["registered", "checked_in"]),
    admin.from("leads").select("email").eq("event_id", event.id).eq("organization_id", org.id).eq("status", "registered"),
  ]);

  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const row of [...(registrations ?? []), ...(leads ?? [])]) {
    const email = row.email?.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    recipients.push(email);
  }
  if (recipients.length === 0) return NextResponse.json({ error: "No attendees to email yet." }, { status: 400 });

  const truncated = recipients.length > BROADCAST_RECIPIENT_CAP;
  const finalRecipients = truncated ? recipients.slice(0, BROADCAST_RECIPIENT_CAP) : recipients;
  if (truncated) {
    console.warn(`[broadcast] event ${event.id} has ${recipients.length} recipients, capped to ${BROADCAST_RECIPIENT_CAP}.`);
  }

  const { sentCount, totalCount } = await sendBroadcastEmail({
    recipients: finalRecipients,
    eventName: event.name,
    subject: subject || `Update from ${event.name}`,
    bodyHtml: message,
  });

  return NextResponse.json({ success: true, sentCount, totalCount, truncated });
}
