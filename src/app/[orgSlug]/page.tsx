import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAnonClient } from "@/lib/supabase/anon";
import { OrgProfileContent } from "@/components/org-profile-content";
import { PublicHeader, RegisterPageContent } from "@/components/register-page-content";
import { buildEventJsonLd, canonicalEventUrl, resolveEventForOg, safeJsonLdString } from "@/lib/event-og-image";
import { formatDate, formatTime } from "@/lib/utils";

type Params = { orgSlug: string };
type OrgProfileRow = { name: string; bio: string | null };

/** This one root segment resolves four different kinds of thing by the same
 *  slug, checked in this order (first match wins — org first, since losing a
 *  profile link to some unrelated event's chosen slug would be the more
 *  disruptive collision): an organizer's public profile; an event's own
 *  register page, once it has a global slug (migration 0057); an event's
 *  short staff check-in link; or its short rep check-in link (migration 0087
 *  — both redirect straight into the existing /staff-setup or /rep-login
 *  flow rather than rendering anything here). Each lives in its own table
 *  column with its own uniqueness constraint, so nothing prevents two of
 *  these from colliding on the same literal string — same accepted
 *  trade-off as the registration slug already documented below: a
 *  collision is just a dead/misrouted link the organizer would notice
 *  immediately, not a security issue. A slug that matches none of the four
 *  renders a plain not-found state below. */
async function resolveOrgProfile(slug: string): Promise<OrgProfileRow | null> {
  const supabase = createAnonClient();
  const { data } = await supabase.rpc("public_organization_profile", { org_slug: slug }).maybeSingle<OrgProfileRow>();
  return data ?? null;
}

async function resolveEventOrgSlug(slug: string): Promise<string | null> {
  const supabase = createAnonClient();
  const { data } = await supabase.rpc("public_event_by_slug", { p_slug: slug }).maybeSingle<{ event_id: string; org_slug: string }>();
  return data?.org_slug ?? null;
}

async function resolveStaffCheckinOrgSlug(slug: string): Promise<string | null> {
  const supabase = createAnonClient();
  const { data } = await supabase.rpc("public_event_by_staff_checkin_slug", { p_slug: slug }).maybeSingle<{ event_id: string; org_slug: string }>();
  return data?.org_slug ?? null;
}

async function resolveRepCheckinOrgSlug(slug: string): Promise<string | null> {
  const supabase = createAnonClient();
  const { data } = await supabase.rpc("public_event_by_rep_checkin_slug", { p_slug: slug }).maybeSingle<{ event_id: string; org_slug: string }>();
  return data?.org_slug ?? null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { orgSlug: slug } = await params;

  const org = await resolveOrgProfile(slug);
  if (org) {
    const description = org.bio || `Events by ${org.name} on eventbuddy.`;
    return {
      title: org.name,
      description,
      alternates: { canonical: `/${slug}` },
      openGraph: { title: org.name, description },
      twitter: { card: "summary", title: org.name, description },
    };
  }

  const eventOrgSlug = await resolveEventOrgSlug(slug);
  if (!eventOrgSlug) return {};
  const event = await resolveEventForOg(eventOrgSlug, slug);
  if (!event) return {};

  const whenWhere = [
    `${formatDate(event.date)}${event.startTime ? ` · ${formatTime(event.startTime)}` : ""}`,
    event.eventFormat === "virtual" ? event.virtualPlatform || "Virtual event" : [event.venue, event.location].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(" — ");

  return {
    title: event.name,
    description: whenWhere,
    alternates: { canonical: `/${slug}` },
    openGraph: { title: event.name, description: whenWhere },
    twitter: { card: "summary_large_image", title: event.name, description: whenWhere },
  };
}

export default async function RootSlugPage({ params }: { params: Promise<Params> }) {
  const { orgSlug: slug } = await params;

  const org = await resolveOrgProfile(slug);
  if (org) {
    return <OrgProfileContent orgSlug={slug} />;
  }

  const eventOrgSlug = await resolveEventOrgSlug(slug);
  if (eventOrgSlug) {
    const event = await resolveEventForOg(eventOrgSlug, slug);
    return (
      <>
        {event && (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLdString(buildEventJsonLd(event, canonicalEventUrl(eventOrgSlug, event))) }} />
        )}
        <RegisterPageContent orgSlug={eventOrgSlug} eventIdOrSlug={slug} />
      </>
    );
  }

  const staffOrgSlug = await resolveStaffCheckinOrgSlug(slug);
  if (staffOrgSlug) {
    redirect(`/${staffOrgSlug}/staff-setup/${encodeURIComponent(slug)}`);
  }

  const repOrgSlug = await resolveRepCheckinOrgSlug(slug);
  if (repOrgSlug) {
    redirect(`/${repOrgSlug}/rep-login/${encodeURIComponent(slug)}`);
  }

  return (
    <div className="min-h-screen bg-[#22103A]">
      <PublicHeader />
      <div className="flex items-center justify-center p-6 py-32">
        <div className="text-center text-white/60 max-w-sm">
          <p className="font-medium text-white">This page couldn&apos;t be found.</p>
          <p className="text-sm mt-1">Check the link you were given and try again.</p>
        </div>
      </div>
    </div>
  );
}
