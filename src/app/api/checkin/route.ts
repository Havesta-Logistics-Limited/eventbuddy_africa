import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type CheckinBody = {
  staffId: string;
  referenceId: string;
};

/**
 * Staff scans (or types in) an attendee's reference ID at /checkin. Modeled on
 * /api/leads: eventId is resolved authoritatively from the staffId's own row
 * server-side, never trusted from the client, and the registration being checked in
 * must belong to that same event.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as Partial<CheckinBody>;
  const { staffId, referenceId } = body;

  if (!staffId || !referenceId?.trim()) {
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

  const normalized = referenceId.trim().toUpperCase();
  const { data: registration } = await supabase
    .from("registrations")
    .select("*")
    .eq("event_id", staffRow.event_id)
    .eq("reference_id", normalized)
    .maybeSingle();

  if (!registration) {
    return NextResponse.json({ error: "No registration found for that code, for this event." }, { status: 404 });
  }

  if (registration.status === "checked_in") {
    return NextResponse.json({
      success: true,
      alreadyCheckedIn: true,
      registration: { referenceId: registration.reference_id, fullName: registration.full_name, checkedInAt: registration.checked_in_at },
    });
  }

  const { data: updated, error } = await supabase
    .from("registrations")
    .update({ status: "checked_in", checked_in_at: new Date().toISOString(), checked_in_by: staffRow.id })
    .eq("id", registration.id)
    .select()
    .single();
  if (error || !updated) {
    return NextResponse.json({ error: error?.message || "Couldn't check this attendee in." }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    alreadyCheckedIn: false,
    registration: { referenceId: updated.reference_id, fullName: updated.full_name, checkedInAt: updated.checked_in_at },
  });
}
