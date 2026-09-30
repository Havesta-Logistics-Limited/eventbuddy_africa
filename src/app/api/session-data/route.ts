import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";

/**
 * Everything a staff/rep device session needs after check-in: their org's destinations,
 * universities, and events (for display), plus their role-appropriate slice of leads
 * (own leads for staff, their university's leads for rep — matching the pre-Phase-2
 * filter logic in leads/page.tsx). Staff/rep aren't Supabase Auth users, so this runs
 * through the service-role client rather than relying on RLS.
 *
 * POST, not GET+query-string: staffId is a long-lived bearer credential (see
 * staff-checkin/route.ts), and a query string would otherwise land in server access
 * logs, CDN logs, and browser history — the one place among the staff-session routes
 * this credential wasn't already kept out of.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { staffId?: string; pendingCount?: number } | null;
  const staffId = body?.staffId;
  if (!staffId) return NextResponse.json({ error: "Missing staffId." }, { status: 400 });

  if (!(await checkRateLimit(`session-data:staff:${staffId}`, 60, 10 * 60))) {
    return rateLimitedResponse();
  }
  // Per-device (staff) above is the real control. The IP ceiling has to clear
  // a whole event's staff phones on one venue WiFi, each polling on mount,
  // focus and a 30s heartbeat — 120 was well inside what 30 devices generate.
  if (!(await checkRateLimit(`session-data:ip:${clientIp(request)}`, 2000, 10 * 60))) {
    return rateLimitedResponse();
  }

  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || apiKey === "paste_your_supabase_service_role_key_here") {
    return NextResponse.json({ error: "Not configured yet." }, { status: 500 });
  }

  const supabase = createAdminClient();

  const { data: staffRow } = await supabase.from("staff").select("*").eq("id", staffId).maybeSingle();
  if (!staffRow) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  const orgId = staffRow.organization_id;

  // This device telling us what it is still holding. Leads that haven't synced
  // have never reached the server, so this report is the only way an organizer
  // can see them at all. Best-effort on purpose: it must never fail the data
  // this request actually exists to return, and it no-ops cleanly on a
  // deployment where migration 0096 hasn't been applied yet.
  const reported = Number(body?.pendingCount);
  if (Number.isFinite(reported) && reported >= 0) {
    void supabase
      .from("staff")
      .update({ pending_leads_count: Math.min(Math.trunc(reported), 100000), last_sync_at: new Date().toISOString() })
      .eq("id", staffRow.id)
      .then(({ error }) => {
        if (error) console.warn("[session-data] queue status not recorded:", error.message);
      });
  }

  const leadsQuery = fetchAllRows((from, to) =>
    (staffRow.role === "rep"
      ? supabase.from("leads").select("*").eq("organization_id", orgId).eq("university_id", staffRow.university_id)
      : supabase.from("leads").select("*").eq("organization_id", orgId).eq("staff_id", staffRow.id)
    )
      .order("id")
      .range(from, to)
  );

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
      email: staffRow.email ?? undefined,
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
      templateId: e.template_id ?? "education-fair",
      customFields: e.custom_fields ?? [],
      timezone: e.timezone ?? undefined,
      captureOverride: e.capture_override ?? null,
      createdAt: e.created_at,
    })),
    leads: (leadRes.data ?? []).map(mapLead),
  });
}

function mapLead(l: {
  id: string;
  event_id: string;
  destination_id: string | null;
  university_id: string | null;
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
  custom_answers: Record<string, string | string[]> | null;
  created_at: string;
}) {
  return {
    id: l.id,
    eventId: l.event_id,
    destinationId: l.destination_id ?? undefined,
    universityId: l.university_id ?? undefined,
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
    customAnswers: l.custom_answers ?? {},
    createdAt: l.created_at,
  };
}
