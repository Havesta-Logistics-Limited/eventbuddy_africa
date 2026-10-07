import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCaptureGate, windowFromEvent } from "@/lib/capture-window";

type CheckinBody = {
  staffId: string;
  referenceId: string;
  /** Staff confirmed checking this attendee in before the event's start time. */
  allowEarly?: boolean;
};

/**
 * Staff scans (or types in) an attendee's reference ID at /checkin. Modeled on
 * /api/leads: eventId is resolved authoritatively from the staffId's own row
 * server-side, never trusted from the client, and the registration being checked in
 * must belong to that same event.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as Partial<CheckinBody>;
  const { staffId, referenceId, allowEarly } = body;

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

  // A refunded, declined, pending or waitlisted ticket must never get in.
  if (registration.status === "cancelled" || registration.status === "declined") {
    return NextResponse.json({ error: `This ticket for ${registration.full_name} was cancelled or refunded.`, fullName: registration.full_name }, { status: 409 });
  }
  if (registration.status === "pending" || registration.status === "waitlisted") {
    return NextResponse.json(
      { error: `${registration.full_name} is ${registration.status === "pending" ? "still waiting for approval" : "on the waitlist"}, not registered.`, fullName: registration.full_name },
      { status: 409 }
    );
  }

  if (registration.status === "checked_in") {
    return NextResponse.json({
      success: true,
      alreadyCheckedIn: true,
      registration: { referenceId: registration.reference_id, fullName: registration.full_name, checkedInAt: registration.checked_in_at },
    });
  }

  // Before the event starts: don't check in yet, tell the scanner so staff can
  // choose to check this attendee in early. Decided here, not on the device,
  // so a wrong phone clock can't skip it.
  if (!allowEarly) {
    const { data: event } = await supabase
      .from("events")
      .select("date, end_date, start_time, end_time, timezone, capture_override")
      .eq("id", staffRow.event_id)
      .maybeSingle();
    if (event) {
      const gate = getCaptureGate(
        windowFromEvent({ date: event.date, endDate: event.end_date ?? undefined, startTime: event.start_time ?? undefined, endTime: event.end_time ?? undefined }),
        event.timezone ?? undefined,
        event.capture_override ?? undefined
      );
      if (!gate.open && gate.reason === "not_started") {
        return NextResponse.json({
          success: false,
          early: true,
          opensAt: gate.opensAt.toISOString(),
          registration: { referenceId: registration.reference_id, fullName: registration.full_name },
        });
      }
    }
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
