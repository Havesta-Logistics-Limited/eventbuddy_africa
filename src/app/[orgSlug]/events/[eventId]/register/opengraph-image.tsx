import DefaultImage from "@/app/opengraph-image";
import { buildEventOgImage, eventOgImageSize, resolveEventForOg } from "@/lib/event-og-image";

export const alt = "Event registration";
export const size = eventOgImageSize;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const event = await resolveEventForOg(orgSlug, eventId);
  if (!event) return DefaultImage();
  return buildEventOgImage(event);
}
