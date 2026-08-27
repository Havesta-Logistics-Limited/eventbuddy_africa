import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

type LookupBody = {
  staffId: string;
  referenceId: string;
};

/**
 * Staff at a delegate/rep booth scans (or types) an attendee's reference ID to pull their
 * self-service registration details into the lead-capture form, instead of re-typing name/
 * email/phone from scratch. Being scanned at a booth is itself evidence the attendee showed
 * up, so this also marks the registration checked-in (unless it's cancelled) — staff working
 * a booth shouldn't have to separately visit /checkin to get the same attendee marked present.
 * Modeled on /api/checkin: eventId is resolved authoritatively from the staffId's own row
 * server-side, and the registration looked up must belong to that same event.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as Partial<LookupBody>;
  const { staffId, referenceId } = body;

  if (!staffId || !referenceId?.trim()) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  // This returns attendee PII (name/email/phone) per guessed reference ID — mirrors
  // /api/leads's per-staffId throttle so a self-minted staffId (see staff-checkin's
  // own rate limit above) can't be used to script a scraping run.
  if (!(await checkRateLimit(`registrations-lookup:staff:${staffId}`, 60, 10 * 60))) {
    return rateLimitedResponse();
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
    .select("id, full_name, email, phone, custom_answers, status")
    .eq("event_id", staffRow.event_id)
    .eq("reference_id", normalized)
    .maybeSingle();

  if (!registration) {
    return NextResponse.json({ error: "No registration found for that code, for this event." }, { status: 404 });
  }

  if (registration.status === "registered") {
    await supabase
      .from("registrations")
      .update({ status: "checked_in", checked_in_at: new Date().toISOString(), checked_in_by: staffRow.id })
      .eq("id", registration.id);
  }

  // One collection per attendee per university — a different university's booth scanning
  // the same code later is a legitimate second lead (see 0014_lead_registration_link.sql),
  // so this is scoped to (registration, university), not just (registration, event).
  if (staffRow.university_id) {
    const { data: existingLead } = await supabase
      .from("leads")
      .select("id")
      .eq("registration_id", registration.id)
      .eq("university_id", staffRow.university_id)
      .maybeSingle();
    if (existingLead) {
      return NextResponse.json({ success: true, alreadyCollected: true });
    }
  }

  const [firstName, ...rest] = registration.full_name.split(" ");
  const lastName = rest.join(" ");

  return NextResponse.json({
    success: true,
    alreadyCollected: false,
    registration: {
      id: registration.id,
      firstName: firstName || "",
      lastName: lastName || "",
      email: registration.email,
      phone: registration.phone || "",
      customAnswers: registration.custom_answers || {},
    },
  });
}
