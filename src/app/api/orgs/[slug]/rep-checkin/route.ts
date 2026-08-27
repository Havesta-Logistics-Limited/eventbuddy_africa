import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { accessCodeMatches } from "@/lib/access-code";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";

type RepCheckinBody = {
  eventId: string;
  destinationId: string;
  universityId: string;
  code?: string;
};

/**
 * Rep check-in — validates the event's repAccessCode server-side (never sent to the
 * browser). Reps must already exist (admin-provisioned in Settings) — there's no
 * self-serve "new rep" option, matching the pre-Phase-2 behavior.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/rep-checkin">) {
  const { slug } = await ctx.params;
  const body = (await request.json()) as Partial<RepCheckinBody>;
  const { eventId, destinationId, universityId, code } = body;

  if (!eventId || !destinationId || !universityId) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  // Same brute-force exposure as staff-checkin's access code — guard it the same way.
  if (!(await checkRateLimit(`rep-checkin:ip:${clientIp(request)}`, 20, 10 * 60))) {
    return rateLimitedResponse();
  }

  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || apiKey === "paste_your_supabase_service_role_key_here") {
    return NextResponse.json({ error: "Not configured yet." }, { status: 500 });
  }

  const supabase = createAdminClient();

  const { data: org } = await supabase.from("organizations").select("id, is_suspended").ilike("slug", slug).maybeSingle();
  if (!org) return NextResponse.json({ error: "No organization found for that link." }, { status: 404 });
  if (org.is_suspended) return NextResponse.json({ error: "Check-in is unavailable for this event right now." }, { status: 403 });

  const { data: event } = await supabase
    .from("events")
    .select("id, rep_access_code, allow_rep_access, published")
    .eq("id", eventId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "That event couldn't be found." }, { status: 404 });
  if (!event.published) return NextResponse.json({ error: "This event isn't live yet." }, { status: 403 });
  if (event.allow_rep_access === false) {
    return NextResponse.json({ error: "This event doesn't have rep check-in enabled." }, { status: 403 });
  }

  if (event.rep_access_code && !accessCodeMatches(event.rep_access_code, code || "")) {
    return NextResponse.json({ error: "That access code doesn't match this event. Check with your event coordinator and try again." }, { status: 403 });
  }

  const { data: rep } = await supabase
    .from("staff")
    .select("*")
    .eq("organization_id", org.id)
    .eq("role", "rep")
    .eq("university_id", universityId)
    .maybeSingle();
  if (!rep) return NextResponse.json({ error: "No rep account exists for this university." }, { status: 404 });
  if (rep.is_online) return NextResponse.json({ error: "A representative is already logged in for this university." }, { status: 409 });

  const { data: updated, error } = await supabase
    .from("staff")
    .update({ event_id: eventId, is_online: true })
    .eq("id", rep.id)
    .select()
    .single();
  if (error || !updated) return NextResponse.json({ error: error?.message || "Couldn't check you in." }, { status: 500 });

  return NextResponse.json({
    staff: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: "rep",
      destinationId: updated.destination_id,
      universityId: updated.university_id,
      eventId: updated.event_id,
      isOnline: updated.is_online,
    },
  });
}
