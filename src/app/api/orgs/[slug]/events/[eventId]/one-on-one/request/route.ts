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

  // Capacity (if the organizer set one) is enforced atomically inside this function
  // via a per-event advisory lock — a plain count-then-insert here would let two
  // concurrent submissions both slip past a limit of, say, 1 (migration 0059).
  const { data: result, error: rpcError } = await admin
    .rpc("submit_one_on_one_request", {
      p_event_id: event.id,
      p_full_name: fullName.trim(),
      p_email: email.trim(),
      p_phone: phone?.trim() || null,
      p_note: note?.trim() || null,
    })
    .maybeSingle<{ ok: boolean; error_message: string | null; request_id: string | null }>();
  if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 });
  if (!result?.ok) return NextResponse.json({ error: result?.error_message || "Couldn't send your request." }, { status: 409 });

  const emailSent = await sendOneOnOneRequestConfirmation(email.trim(), event.name);

  return NextResponse.json({ success: true, emailSent });
}
