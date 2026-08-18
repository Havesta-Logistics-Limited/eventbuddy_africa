import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type LeadBody = {
  staffId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  phone: string;
  preferredCourse: string;
  levelOfInterest: string;
  startYear: string;
  highestEducation: string;
  takenIELTS: string;
  comments: string;
};

/**
 * Staff submits a lead from /collect. eventId/destinationId/universityId/organizationId
 * are resolved authoritatively from the staffId's own row server-side — never trusted
 * from the client — so a tampered request can't write a lead into another org.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as Partial<LeadBody>;
  const { staffId, firstName, lastName, email, phone, preferredCourse, levelOfInterest, startYear, highestEducation, takenIELTS } = body;

  if (!staffId || !firstName || !lastName || !email || !phone || !preferredCourse) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || apiKey === "paste_your_supabase_service_role_key_here") {
    return NextResponse.json({ error: "Not configured yet." }, { status: 500 });
  }

  const supabase = createAdminClient();

  const { data: staffRow } = await supabase.from("staff").select("*").eq("id", staffId).maybeSingle();
  if (!staffRow || !staffRow.event_id || !staffRow.destination_id || !staffRow.university_id) {
    return NextResponse.json({ error: "Your session has expired — please check in again." }, { status: 401 });
  }

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      organization_id: staffRow.organization_id,
      event_id: staffRow.event_id,
      destination_id: staffRow.destination_id,
      university_id: staffRow.university_id,
      staff_id: staffRow.id,
      first_name: firstName,
      middle_name: body.middleName || null,
      last_name: lastName,
      email,
      phone,
      preferred_course: preferredCourse,
      level_of_interest: levelOfInterest || "",
      start_year: startYear || "",
      highest_education: highestEducation || "",
      taken_ielts: takenIELTS || "",
      comments: body.comments || "",
    })
    .select()
    .single();

  if (error || !lead) {
    return NextResponse.json({ error: error?.message || "Couldn't save that lead." }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: lead.id });
}
