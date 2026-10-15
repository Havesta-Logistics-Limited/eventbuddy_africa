import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";
import { isValidEmail } from "@/lib/validation";

/**
 * "Email me when registration opens" (migration 0128): a visitor leaves their
 * email on an event whose registration hasn't opened yet. Saved once per
 * email per event; they're emailed when the organizer opens registration.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/notify-open">) {
  const { slug, eventId } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  if (!isValidEmail(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!(await checkRateLimit(`notify-open:ip:${clientIp(request)}`, 10, 10 * 60))) return rateLimitedResponse();

  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("id, is_suspended").ilike("slug", slug).maybeSingle();
  if (!org || org.is_suspended) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });
  const { data: event } = await admin.from("events").select("id, published, registration_open").eq("id", eventId).eq("organization_id", org.id).maybeSingle();
  if (!event || !event.published) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });
  if (event.registration_open !== false) return NextResponse.json({ error: "Registration is already open: refresh the page to register." }, { status: 409 });

  const { error } = await admin.from("event_open_notify").insert({ event_id: event.id, email });
  // already on the list (unique per event and email): that's fine
  if (error && error.code !== "23505") return NextResponse.json({ error: "Couldn't save that. Please try again." }, { status: 500 });
  return NextResponse.json({ success: true });
}
