import type { Metadata } from "next";
import { RegisterPageContent } from "@/components/register-page-content";
import { buildEventJsonLd, canonicalEventPath, canonicalEventUrl, resolveEventForOg } from "@/lib/event-og-image";
import { formatDate, formatTime } from "@/lib/utils";

type Params = { orgSlug: string; eventId: string };

/** A Server Component specifically so this can export real per-event metadata — a
 *  shared link should carry the actual event's name/date/location and its own cover
 *  photo (see the sibling opengraph-image.tsx), not the site's generic default
 *  card. The interactive page itself is still fully client-side, in
 *  RegisterPageContent. */
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { orgSlug, eventId } = await params;
  const event = await resolveEventForOg(orgSlug, eventId);
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
    alternates: { canonical: canonicalEventPath(orgSlug, event) },
    openGraph: { title: event.name, description: whenWhere },
    twitter: { card: "summary_large_image", title: event.name, description: whenWhere },
  };
}

/** Org-scoped registration link — kept working for anything shared before
 *  /discover/[slug] existed, or an event with no global slug set. */
export default async function RegisterPage({ params }: { params: Promise<Params> }) {
  const { orgSlug, eventId } = await params;
  const event = await resolveEventForOg(orgSlug, eventId);

  return (
    <>
      {event && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildEventJsonLd(event, canonicalEventUrl(orgSlug, event))) }} />
      )}
      <RegisterPageContent orgSlug={orgSlug} eventIdOrSlug={eventId} />
    </>
  );
}
