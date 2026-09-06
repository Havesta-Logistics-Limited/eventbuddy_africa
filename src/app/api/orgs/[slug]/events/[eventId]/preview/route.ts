import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";
import type { FieldDef } from "@/lib/types";

type OrgRow = { id: string; name: string; slug: string; logo_url: string | null };
type EventRow = {
  id: string;
  slug: string | null;
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
  published: boolean | null;
};

/**
 * Fallback lookup RegisterPageContent uses when an event isn't in the org's
 * normal /events list — which only ever returns published events. Unlike that
 * list, public_event_by_ref has no published/date filter at all, so this is
 * what lets a still-draft event's registration page render at its own real
 * URL (id or slug) before publishing, in the page's own view-only mode. No
 * separate secret: knowing the event's id/slug is the same amount of access
 * the real post-publish link already grants.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/preview">) {
  const { slug, eventId } = await ctx.params;

  const supabase = createAnonClient();
  const { data: event, error } = await supabase.rpc("public_event_by_ref", { org_slug: slug, id_or_slug: eventId }).maybeSingle<EventRow>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });

  const { data: org } = await supabase.rpc("public_org_by_slug", { org_slug: slug }).maybeSingle<OrgRow>();
  if (!org) return NextResponse.json({ error: "No organization found for that link." }, { status: 404 });

  return NextResponse.json({
    organization: { id: org.id, name: org.name, slug: org.slug, logoUrl: org.logo_url ?? undefined },
    event: {
      id: event.id,
      slug: event.slug ?? undefined,
      name: event.name,
      date: event.date,
      endDate: event.end_date ?? undefined,
      startTime: event.start_time ?? undefined,
      endTime: event.end_time ?? undefined,
      location: event.location,
      venue: event.venue,
      destinationIds: event.destination_ids ?? [],
      description: event.description ?? "",
      coverImage: event.cover_image ?? undefined,
      templateId: event.template_id ?? "education-fair",
      category: event.category ?? undefined,
      customFields: (event.custom_fields as FieldDef[] | null) ?? [],
      eventFormat: (event.event_format as "physical" | "virtual" | null) ?? "physical",
      virtualJoinUrl: event.virtual_join_url ?? undefined,
      virtualPlatform: event.virtual_platform ?? undefined,
      virtualAccessNotes: event.virtual_access_notes ?? undefined,
      timezone: event.timezone ?? undefined,
      captureOverride: event.capture_override ?? null,
      allowRepAccess: event.allow_rep_access ?? true,
      selfRegistrationEnabled: event.self_registration_enabled ?? true,
      published: event.published ?? true,
      hasStaffCode: false,
      hasRepCode: false,
    },
  });
}
