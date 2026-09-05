import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";
import type { FieldDef } from "@/lib/types";

type OrgRow = { id: string; name: string; slug: string; logo_url: string | null };
type EventRow = {
  id: string;
  slug: string | null;
  checkin_slug: string | null;
  name: string;
  date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string;
  venue: string;
  destination_ids: string[] | null;
  description: string | null;
  cover_image: string | null;
  template_id: string | null;
  category: string | null;
  custom_fields: unknown;
  event_format: string | null;
  virtual_join_url: string | null;
  virtual_platform: string | null;
  virtual_access_notes: string | null;
  timezone: string | null;
  capture_override: "open" | "closed" | null;
  allow_rep_access: boolean | null;
  self_registration_enabled: boolean | null;
  has_staff_code: boolean;
  has_rep_code: boolean;
};
type DestinationRow = { id: string; name: string; flag: string };
type UniversityRow = { id: string; destination_id: string; name: string; short_name: string };
type StaffNameRow = { name: string };

/**
 * Everything the org-scoped check-in picker (/[orgSlug]/staff-setup, /[orgSlug]/rep-login)
 * needs, with no session required: the org's display info, its non-completed events
 * (safe columns only — never the access code values, only whether one is set), its
 * destinations, and its universities. Access codes are validated server-side at
 * check-in, never sent to the browser. Maps Postgres's snake_case columns to the
 * camelCase shapes the rest of the app already uses (EventRecord, Destination, University).
 *
 * Staff names are name-only too — never the row's real id, which is a permanent bearer
 * session credential (see staff-checkin/route.ts and store.ts's session model); handing
 * it out here, pre-auth, would let anyone skip the access-code check entirely and call
 * /api/session-data, /api/checkin, etc. directly as that staff member.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/orgs/[slug]/events">) {
  const { slug } = await ctx.params;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !url.startsWith("http")) {
    return NextResponse.json({ error: "Not configured yet." }, { status: 500 });
  }

  const supabase = createAnonClient();

  const { data: org, error: orgError } = await supabase.rpc("public_org_by_slug", { org_slug: slug }).maybeSingle<OrgRow>();
  if (orgError || !org) {
    return NextResponse.json({ error: "No organization found for that link." }, { status: 404 });
  }

  const [eventsRes, destinationsRes, universitiesRes, staffRes] = await Promise.all([
    supabase.rpc("public_org_events", { org_slug: slug }),
    supabase.rpc("public_org_destinations", { org_slug: slug }),
    supabase.rpc("public_org_universities", { org_slug: slug }),
    supabase.rpc("public_org_staff_names", { org_slug: slug }),
  ]);

  if (eventsRes.error) return NextResponse.json({ error: eventsRes.error.message }, { status: 500 });
  if (destinationsRes.error) return NextResponse.json({ error: destinationsRes.error.message }, { status: 500 });
  if (universitiesRes.error) return NextResponse.json({ error: universitiesRes.error.message }, { status: 500 });
  if (staffRes.error) return NextResponse.json({ error: staffRes.error.message }, { status: 500 });

  const events = (eventsRes.data ?? []) as EventRow[];
  const destinationRows = (destinationsRes.data ?? []) as DestinationRow[];
  const universityRows = (universitiesRes.data ?? []) as UniversityRow[];
  const staffRows = (staffRes.data ?? []) as StaffNameRow[];

  return NextResponse.json({
    organization: { id: org.id, name: org.name, slug: org.slug, logoUrl: org.logo_url ?? undefined },
    events: events.map((e) => ({
      id: e.id,
      slug: e.slug ?? undefined,
      checkinSlug: e.checkin_slug ?? undefined,
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
      category: e.category ?? undefined,
      customFields: (e.custom_fields as FieldDef[] | null) ?? [],
      eventFormat: (e.event_format as "physical" | "virtual" | null) ?? "physical",
      virtualJoinUrl: e.virtual_join_url ?? undefined,
      virtualPlatform: e.virtual_platform ?? undefined,
      virtualAccessNotes: e.virtual_access_notes ?? undefined,
      timezone: e.timezone ?? undefined,
      captureOverride: e.capture_override ?? null,
      allowRepAccess: e.allow_rep_access ?? true,
      selfRegistrationEnabled: e.self_registration_enabled ?? true,
      hasStaffCode: e.has_staff_code,
      hasRepCode: e.has_rep_code,
    })),
    destinations: destinationRows.map((d) => ({ id: d.id, name: d.name, flag: d.flag })),
    universities: universityRows.map((u) => ({
      id: u.id,
      destinationId: u.destination_id,
      name: u.name,
      shortName: u.short_name,
    })),
    staff: staffRows.map((s) => ({ name: s.name })),
  });
}
