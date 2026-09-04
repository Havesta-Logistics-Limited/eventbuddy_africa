import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOneOnOneRequestConfirmation } from "@/lib/registration-email";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";

type RequestBody = { fullName: string; email: string; phone?: string; note?: string };

/**
 * Records an attendee's interest in a 1-on-1 — public, no session, called right
 * after normal registration completes. Deliberately just a flag with an optional
 * note; the organizer works out who they actually meet with afterward (see the
 * event dashboard's 1-on-1s tab), not this route.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/one-on-one/request">) {
  const { slug, eventId } = await ctx.params;
  const body = (await request.json()) as Partial<RequestBody>;
  const { fullName, email, phone, note } = body;
  if (!fullName?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  if (!(await checkRateLimit(`one-on-one-request:ip:${clientIp(request)}`, 20, 10 * 60))) {
    return rateLimitedResponse();
  }

  const admin = createAdminClient();

  const { data: org } = await admin.from("organizations").select("id").ilike("slug", slug).maybeSingle();
  if (!org) return NextResponse.json({ error: "No organization found for that link." }, { status: 404 });

  const { data: event } = await admin.from("events").select("id, name, published, one_on_one_enabled").eq("id", eventId).eq("organization_id", org.id).maybeSingle();
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });
  if (!event.published || !event.one_on_one_enabled) {
    return NextResponse.json({ error: "1-on-1 requests aren't available for this event." }, { status: 403 });
  }

  const { data: created, error: insertError } = await admin
    .from("event_one_on_one_requests")
    .insert({ organization_id: org.id, event_id: event.id, full_name: fullName.trim(), email: email.trim(), phone: phone?.trim() || null, note: note?.trim() || null })
    .select()
    .single();
  if (insertError || !created) {
    return NextResponse.json({ error: insertError?.message || "Couldn't send your request." }, { status: 500 });
  }

  const emailSent = await sendOneOnOneRequestConfirmation(created.email, event.name);

  return NextResponse.json({ success: true, emailSent });
}
