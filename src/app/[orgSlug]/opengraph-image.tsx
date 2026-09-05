import DefaultImage from "@/app/opengraph-image";
import { createAnonClient } from "@/lib/supabase/anon";
import { buildEventOgImage, eventOgImageSize, resolveEventForOg } from "@/lib/event-og-image";

export const alt = "eventbuddy";
export const size = eventOgImageSize;
export const contentType = "image/png";

/** Mirrors this segment's own page.tsx: an event's real share card once its slug
 *  resolves, the generic site default for an org profile or an unresolved slug —
 *  no bespoke org-profile share card exists yet, same as before this route also
 *  had to resolve events. */
export default async function Image({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug: slug } = await params;
  const supabase = createAnonClient();
  const { data } = await supabase.rpc("public_event_by_slug", { p_slug: slug }).maybeSingle<{ event_id: string; org_slug: string }>();
  if (!data) return DefaultImage();
  const event = await resolveEventForOg(data.org_slug, data.event_id);
  if (!event) return DefaultImage();
  return buildEventOgImage(event);
}
