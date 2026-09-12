import type { Metadata } from "next";
import { eventOgTitleAndDescription, resolveEventForOg } from "@/lib/event-og-image";

type Params = { orgSlug: string; event?: string[] };

/** page.tsx in this segment is a client component ("use client"), which can't
 *  export generateMetadata itself — this server layout carries it instead: the
 *  event's own name/schedule as title/description (otherwise this would inherit
 *  the site's generic default, same class of bug as the image itself had), and
 *  openGraph.images pointing at the shared /api/og/checkin route (see that
 *  file's comment for why this can't be a plain opengraph-image.tsx here). */
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { orgSlug, event } = await params;
  const pinnedEvent = event?.[0];
  if (!pinnedEvent) return {};
  const resolved = await resolveEventForOg(orgSlug, pinnedEvent);
  const imageUrl = `/api/og/checkin?orgSlug=${encodeURIComponent(orgSlug)}&event=${encodeURIComponent(pinnedEvent)}&kind=staff`;
  if (!resolved) return { openGraph: { images: [imageUrl] } };
  const { title, description } = eventOgTitleAndDescription(resolved);
  return {
    title: `Staff check-in — ${title}`,
    description,
    openGraph: { title: `Staff check-in — ${title}`, description, images: [imageUrl] },
  };
}

export default function StaffSetupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
