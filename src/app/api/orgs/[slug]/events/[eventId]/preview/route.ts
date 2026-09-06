import { NextResponse } from "next/server";
import { z } from "zod";
import { createAnonClient } from "@/lib/supabase/anon";
import type { FieldDef } from "@/lib/types";

type OrgRow = { id: string; name: string; slug: string; logo_url: string | null };
type EventRow = {
  id: string;
  organization_id: string;
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
};

const QuerySchema = z.object({ token: z.string().uuid() });

/**
 * Powers the private "preview link" an organizer can share for a still-draft
 * event — same event/organization shape as /api/orgs/[slug]/events, but reached
 * through public_event_preview(id, token) instead of public_org_events, which
 * deliberately never surfaces anything with published=false. Knowledge of the
 * token is the entire access control (see migration 0079) — this route adds no
 * auth check of its own beyond passing it through and confirming the org slug
 * in the URL actually matches the event's real org.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/preview">) {
  const { slug, eventId } = await ctx.params;
  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({ token: searchParams.get("token") });
  if (!parsed.success) {
    return NextResponse.json({ error: "This preview link is invalid." }, { status: 400 });
  }

  const supabase = createAnonClient();
  const { data: event, error } = await supabase
    .rpc("public_event_preview", { p_event_id: eventId, p_token: parsed.data.token })
    .maybeSingle<EventRow>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!event) return NextResponse.json({ error: "This preview link is invalid or has expired." }, { status: 404 });

  const { data: org } = await supabase.rpc("public_org_by_slug", { org_slug: slug }).maybeSingle<OrgRow>();
  if (!org || org.id !== event.organization_id) {
    return NextResponse.json({ error: "This preview link is invalid or has expired." }, { status: 404 });
  }

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
      hasStaffCode: false,
      hasRepCode: false,
    },
  });
}
