import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCaptureGate, windowFromEvent } from "@/lib/capture-window";

type LeadBody = {
  staffId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  phone: string;
  preferredCourse?: string;
  levelOfInterest: string;
  startYear: string;
  highestEducation: string;
  takenIELTS: string;
  comments: string;
  customAnswers?: Record<string, string | string[]>;
  registrationId?: string;
};

/**
 * Staff submits a lead from /collect. eventId/destinationId/universityId/organizationId
 * are resolved authoritatively from the staffId's own row server-side — never trusted
 * from the client — so a tampered request can't write a lead into another org.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as Partial<LeadBody>;
  const { staffId, firstName, lastName, email, phone, preferredCourse, levelOfInterest, startYear, highestEducation, takenIELTS } = body;

  if (!staffId || !firstName || !lastName || !email || !phone) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || apiKey === "paste_your_supabase_service_role_key_here") {
    return NextResponse.json({ error: "Not configured yet." }, { status: 500 });
  }

  const supabase = createAdminClient();

  const { data: staffRow } = await supabase.from("staff").select("*").eq("id", staffId).maybeSingle();
  if (!staffRow || !staffRow.event_id) {
    return NextResponse.json({ error: "Your session has expired — please check in again." }, { status: 401 });
  }

  const { data: eventRow } = await supabase
    .from("events")
    .select("date, end_date, start_time, end_time, timezone, capture_override, published")
    .eq("id", staffRow.event_id)
    .maybeSingle();
  if (!eventRow) {
    return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });
  }
  if (!eventRow.published) {
    return NextResponse.json({ error: "This event isn't live yet." }, { status: 403 });
  }

  const window = windowFromEvent({
    date: eventRow.date,
    endDate: eventRow.end_date ?? undefined,
    startTime: eventRow.start_time ?? undefined,
    endTime: eventRow.end_time ?? undefined,
  });
  const gate = getCaptureGate(window, eventRow.timezone ?? undefined, eventRow.capture_override ?? undefined);
  if (!gate.open) {
    const message =
      gate.reason === "manually_closed"
        ? "Lead capture has been closed by the event organizer."
        : gate.reason === "not_started"
          ? `Lead capture hasn't opened yet — it opens ${gate.opensAt.toLocaleString()}.`
          : `Lead capture has closed — it ended ${gate.closesAt.toLocaleString()}.`;
    return NextResponse.json({ error: message }, { status: 403 });
  }

  // A lead pulled from a registration (see /api/registrations/lookup) can only be
  // collected once per university — the same attendee visiting a different university's
  // booth is a legitimate second lead, so this is scoped to (registration, university),
  // not just (registration, event). Re-checked here rather than trusted from the lookup
  // response, since time can pass between pulling the data and hitting Save.
  if (body.registrationId && staffRow.university_id) {
    const { data: existing } = await supabase
      .from("leads")
      .select("id")
      .eq("registration_id", body.registrationId)
      .eq("university_id", staffRow.university_id)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "This attendee's data has already been collected for this university." }, { status: 409 });
    }
  }

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      organization_id: staffRow.organization_id,
      event_id: staffRow.event_id,
      destination_id: staffRow.destination_id ?? null,
      university_id: staffRow.university_id ?? null,
      staff_id: staffRow.id,
      registration_id: body.registrationId || null,
      first_name: firstName,
      middle_name: body.middleName || null,
      last_name: lastName,
      email,
      phone,
      preferred_course: preferredCourse || "",
      level_of_interest: levelOfInterest || "",
      start_year: startYear || "",
      highest_education: highestEducation || "",
      taken_ielts: takenIELTS || "",
      comments: body.comments || "",
      custom_answers: body.customAnswers || {},
    })
    .select()
    .single();

  if (error || !lead) {
    return NextResponse.json({ error: error?.message || "Couldn't save that lead." }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: lead.id });
}
