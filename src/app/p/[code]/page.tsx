import type { Metadata } from "next";
import { createAnonClient } from "@/lib/supabase/anon";
import { PublicHeader, RegisterPageContent } from "@/components/register-page-content";
import { resolveEventForOg } from "@/lib/event-og-image";
import { formatDate } from "@/lib/utils";

/**
 * A private event's link: eventbuddy.africa/p/{code} (migration 0128). The
 * event is left out of Discover, profiles and search, and its public slug link
 * doesn't open it; anyone with this link can view it and register or buy.
 * Kept out of search engines.
 */

type Params = { code: string };

async function resolve(code: string) {
  const { data } = await createAnonClient().rpc("public_event_by_private_code", { p_code: code }).maybeSingle<{ event_id: string; org_slug: string }>();
  return data;
}

/** The event's name and cover when the link is shared (WhatsApp etc.), but never indexed. */
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const robots = { index: false, follow: false, nocache: true };
  const hit = await resolve((await params).code);
  const event = hit ? await resolveEventForOg(hit.org_slug, hit.event_id) : null;
  if (!hit || !event) return { title: "Private event", robots };
  const description = [formatDate(event.date), event.eventFormat === "virtual" ? "Virtual event" : [event.venue, event.location].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(" — ");
  const image = `/${hit.org_slug}/events/${hit.event_id}/register/opengraph-image`;
  return {
    title: event.name,
    description,
    robots,
    openGraph: { title: event.name, description, images: [image] },
    twitter: { card: "summary_large_image", title: event.name, description, images: [image] },
  };
}

export default async function PrivateEventPage({ params }: { params: Promise<Params> }) {
  const { code } = await params;
  const hit = await resolve(code);
  if (!hit) {
    return (
      <div className="min-h-screen bg-canvas">
        <PublicHeader />
        <div className="flex items-center justify-center p-6 py-32">
          <div className="max-w-sm text-center text-white/60">
            <p className="font-medium text-white">This private link isn&apos;t valid.</p>
            <p className="mt-1 text-sm">It may have been changed by the organizer. Ask them for the current link.</p>
          </div>
        </div>
      </div>
    );
  }
  return <RegisterPageContent orgSlug={hit.org_slug} eventIdOrSlug={hit.event_id} />;
}
