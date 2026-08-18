import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Everything a staff/rep device session needs after check-in: their org's destinations,
 * universities, and events (for display), plus their role-appropriate slice of leads
 * (own leads for staff, their university's leads for rep — matching the pre-Phase-2
 * filter logic in leads/page.tsx). Staff/rep aren't Supabase Auth users, so this runs
 * through the service-role client rather than relying on RLS.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const staffId = searchParams.get("staffId");
  if (!staffId) return NextResponse.json({ error: "Missing staffId." }, { status: 400 });

  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || apiKey === "paste_your_supabase_service_role_key_here") {
    return NextResponse.json({ error: "Not configured yet." }, { status: 500 });
  }

  const supabase = createAdminClient();

  const { data: staffRow } = await supabase.from("staff").select("*").eq("id", staffId).maybeSingle();
  if (!staffRow) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  const orgId = staffRow.organization_id;

  const leadsQuery =
    staffRow.role === "rep"
      ? supabase.from("leads").select("*").eq("organization_id", orgId).eq("university_id", staffRow.university_id)
      : supabase.from("leads").select("*").eq("organization_id", orgId).eq("staff_id", staffRow.id);

  const [destRes, uniRes, eventRes, leadRes] = await Promise.all([
    supabase.from("destinations").select("*").eq("organization_id", orgId),
    supabase.from("universities").select("*").eq("organization_id", orgId),
    supabase.from("events").select("*").eq("organization_id", orgId),
    leadsQuery,
  ]);

  return NextResponse.json({
    staff: {
      id: staffRow.id,
      name: staffRow.name,
      email: staffRow.email,
      role: staffRow.role,
      destinationId: staffRow.destination_id,
      universityId: staffRow.university_id,
      eventId: staffRow.event_id,
      isOnline: staffRow.is_online,
    },
    destinations: (destRes.data ?? []).map((d) => ({ id: d.id, name: d.name, flag: d.flag })),
    universities: (uniRes.data ?? []).map((u) => ({ id: u.id, destinationId: u.destination_id, name: u.name, shortName: u.short_name })),
    events: (eventRes.data ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      date: e.date,
      endDate: e.end_date ?? undefined,
      startTime: e.start_time ?? undefined,
      endTime: e.end_time ?? undefined,
      location: e.location,
      venue: e.venue,
      destinationIds: e.destination_ids ?? [],
      description: e.description ?? "",
      coverImage: e.cover_image ?? undefined,
      createdAt: e.created_at,
    })),
    leads: (leadRes.data ?? []).map(mapLead),
  });
}

function mapLead(l: {
  id: string;
  event_id: string;
  destination_id: string;
  university_id: string;
  staff_id: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
  phone: string;
  preferred_course: string;
  level_of_interest: string;
  start_year: string;
  highest_education: string;
  taken_ielts: string;
  comments: string;
  created_at: string;
}) {
  return {
    id: l.id,
    eventId: l.event_id,
    destinationId: l.destination_id,
    universityId: l.university_id,
    staffId: l.staff_id ?? "",
    firstName: l.first_name,
    middleName: l.middle_name ?? undefined,
    lastName: l.last_name,
    email: l.email,
    phone: l.phone,
    preferredCourse: l.preferred_course,
    levelOfInterest: l.level_of_interest,
    startYear: l.start_year,
    highestEducation: l.highest_education,
    takenIELTS: l.taken_ielts,
    comments: l.comments,
    createdAt: l.created_at,
  };
}
