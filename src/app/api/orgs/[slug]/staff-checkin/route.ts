import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTemplate } from "@/lib/event-templates";

type StaffCheckinBody = {
  eventId: string;
  staffId?: string;
  name: string;
  destinationId?: string;
  universityId?: string;
  code?: string;
};

/**
 * Staff check-in — validates the event's staffAccessCode server-side (never sent to the
 * browser) and creates/updates the staff row via the service-role client, since this is
 * a lightweight device session, not a Supabase Auth user (see src/lib/store.ts).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/staff-checkin">) {
  const { slug } = await ctx.params;
  const body = (await request.json()) as Partial<StaffCheckinBody>;
  const { eventId, staffId, name, destinationId, universityId, code } = body;

  if (!eventId || (!staffId && !name?.trim())) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
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
    .select("id, staff_access_code, template_id")
    .eq("id", eventId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "That event couldn't be found." }, { status: 404 });

  if (event.staff_access_code && event.staff_access_code.trim().toLowerCase() !== (code || "").trim().toLowerCase()) {
    return NextResponse.json({ error: "That access code doesn't match this event. Check with your coordinator and try again." }, { status: 403 });
  }

  const template = getTemplate(event.template_id ?? undefined);
  if (template.usesDestinations && (!destinationId || !universityId)) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  const checkinPatch = {
    destination_id: template.usesDestinations ? destinationId : null,
    university_id: template.usesDestinations ? universityId : null,
    event_id: eventId,
  };

  let staffRow;
  if (staffId) {
    const { data, error } = await supabase.from("staff").update(checkinPatch).eq("id", staffId).eq("organization_id", org.id).select().maybeSingle();
    if (error || !data) return NextResponse.json({ error: error?.message || "Couldn't find that staff member." }, { status: 400 });
    staffRow = data;
  } else {
    const trimmedName = name!.trim();

    // Someone typing their name again through "New staff member" (e.g. on a different
    // device, or after a previous session ended) should reuse their existing row rather
    // than fork into a duplicate — match by name within this org, case-insensitively.
    const { data: existing } = await supabase.from("staff").select("*").eq("organization_id", org.id).eq("role", "staff").ilike("name", trimmedName).maybeSingle();

    if (existing) {
      const { data, error } = await supabase.from("staff").update(checkinPatch).eq("id", existing.id).select().single();
      if (error || !data) return NextResponse.json({ error: error?.message || "Couldn't check you in." }, { status: 500 });
      staffRow = data;
    } else {
      const { data, error } = await supabase
        .from("staff")
        .insert({
          organization_id: org.id,
          name: trimmedName,
          email: `${trimmedName.replace(/\s+/g, ".").toLowerCase()}@eventpal.com`,
          role: "staff",
          ...checkinPatch,
        })
        .select()
        .single();
      if (error || !data) return NextResponse.json({ error: error?.message || "Couldn't check you in." }, { status: 500 });
      staffRow = data;
    }
  }

  return NextResponse.json({
    staff: {
      id: staffRow.id,
      name: staffRow.name,
      email: staffRow.email,
      role: "staff",
      destinationId: staffRow.destination_id,
      universityId: staffRow.university_id,
      eventId: staffRow.event_id,
    },
  });
}
