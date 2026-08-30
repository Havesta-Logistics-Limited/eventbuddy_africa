import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";

type Body = { email: string; firstName?: string; lastName?: string; phone?: string; ticketTypeId?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Best-effort telemetry, not a registration — fired by the public form as soon
 * as a visitor types a plausible email, well before they submit. Lets an
 * organizer see (and follow up with) people who abandoned the form itself,
 * distinct from paystack_transactions' "pending" status which only covers
 * people who reached checkout. Never blocks or affects the actual submit flow
 * — the client fires this and ignores the result either way.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/registration-form-start">) {
  const { slug, eventId } = await ctx.params;
  const body = (await request.json().catch(() => null)) as Partial<Body> | null;
  const email = body?.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Invalid email." }, { status: 400 });
  }

  if (!(await checkRateLimit(`form-start:ip:${clientIp(request)}`, 30, 10 * 60))) {
    return rateLimitedResponse();
  }

  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("id").ilike("slug", slug).maybeSingle();
  if (!org) return NextResponse.json({ error: "No organization found for that link." }, { status: 404 });

  const { data: event } = await admin.from("events").select("id").eq("id", eventId).eq("organization_id", org.id).maybeSingle();
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });

  const fullName = [body?.firstName?.trim(), body?.lastName?.trim()].filter(Boolean).join(" ") || null;

  await admin.from("registration_form_starts").upsert(
    {
      organization_id: org.id,
      event_id: event.id,
      email,
      full_name: fullName,
      phone: body?.phone?.trim() || null,
      ticket_type_id: body?.ticketTypeId || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_id,email" }
  );

  return NextResponse.json({ success: true });
}
