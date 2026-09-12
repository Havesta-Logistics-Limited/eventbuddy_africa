import { NextRequest } from "next/server";
import DefaultImage from "@/app/opengraph-image";
import { buildEventOgImage, resolveEventForOg } from "@/lib/event-og-image";

/**
 * Share-card image for a staff/rep check-in link. Not a file-convention
 * opengraph-image.tsx because those live under [[...event]] (the optional
 * catch-all that carries the checkin slug/id), and Next.js rejects an optional
 * catch-all that isn't the last part of its route — which the auto-added
 * /opengraph-image segment would violate. A plain route handler has no such
 * restriction, so staff-setup/rep-login's own layout.tsx points its
 * openGraph.images here instead, passing the same two params this needs.
 */
export async function GET(request: NextRequest) {
  const orgSlug = request.nextUrl.searchParams.get("orgSlug");
  const eventIdOrSlug = request.nextUrl.searchParams.get("event");
  if (!orgSlug || !eventIdOrSlug) return DefaultImage();
  const event = await resolveEventForOg(orgSlug, eventIdOrSlug);
  if (!event) return DefaultImage();
  return buildEventOgImage(event);
}
