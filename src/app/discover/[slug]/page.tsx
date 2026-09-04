import type { Metadata } from "next";
import { PublicHeader, RegisterPageContent } from "@/components/register-page-content";
import { createAnonClient } from "@/lib/supabase/anon";
import { resolveEventForOg } from "@/lib/event-og-image";
import { formatDate, formatTime } from "@/lib/utils";

type Params = { slug: string };

async function resolveOrgSlug(slug: string): Promise<string | null> {
  const supabase = createAnonClient();
  const { data } = await supabase.rpc("public_event_by_slug", { p_slug: slug }).maybeSingle<{ event_id: string; org_slug: string }>();
  return data?.org_slug ?? null;
}

/** A Server Component specifically so this can export real per-event metadata — a
 *  shared link should carry the actual event's name/date/location and its own cover
 *  photo (see the sibling opengraph-image.tsx), not the site's generic default card.
 *  Resolving the org here server-side also means the client never needs its own
 *  loading/not-found flicker before RegisterPageContent can even start. */
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const orgSlug = await resolveOrgSlug(slug);
  if (!orgSlug) return {};
  const event = await resolveEventForOg(orgSlug, slug);
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
    openGraph: { title: event.name, description: whenWhere },
    twitter: { card: "summary_large_image", title: event.name, description: whenWhere },
  };
}

/**
 * The new universal public link format: eventbuddy.africa/discover/{event-slug} — no
 * org segment in the URL at all. Resolves which organization owns this slug (see
 * migration 0057's globally-unique events.slug), then mounts the exact same
 * registration experience as the older org-scoped route
 * (/[orgSlug]/events/[eventId]/register), which keeps working unchanged for any
 * link shared before this existed, or any event with no slug set.
 */
export default async function DiscoverEventPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const orgSlug = await resolveOrgSlug(slug);

  if (!orgSlug) {
    return (
      <div className="min-h-screen bg-slate-50">
        <PublicHeader />
        <div className="flex items-center justify-center p-6 py-32">
          <div className="text-center text-slate-500 max-w-sm">
            <p className="font-medium text-slate-700">This event couldn&apos;t be found.</p>
            <p className="text-sm mt-1">Check the link you were given and try again.</p>
          </div>
        </div>
      </div>
    );
  }

  return <RegisterPageContent orgSlug={orgSlug} eventIdOrSlug={slug} />;
}
