import type { Metadata } from "next";
import { createAnonClient } from "@/lib/supabase/anon";
import { OrgProfileContent } from "@/components/org-profile-content";
import { PublicHeader, RegisterPageContent } from "@/components/register-page-content";
import { buildEventJsonLd, canonicalEventUrl, resolveEventForOg } from "@/lib/event-og-image";
import { formatDate, formatTime } from "@/lib/utils";

type Params = { orgSlug: string };
type OrgProfileRow = { name: string; bio: string | null };

/** This one root segment resolves two different kinds of thing by the same slug:
 *  an organizer's public profile, or — since events also got a short /[slug] link
 *  once they have a global slug (migration 0057) — an event's own register page.
 *  They can't collide: events.slug and organizations.slug are different columns
 *  in different tables, checked one after the other, org first. A slug that
 *  matches neither renders a plain not-found state below. */
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
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildEventJsonLd(event, canonicalEventUrl(eventOrgSlug, event))) }} />
        )}
        <RegisterPageContent orgSlug={eventOrgSlug} eventIdOrSlug={slug} />
      </>
    );
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
