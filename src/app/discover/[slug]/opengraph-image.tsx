import DefaultImage from "@/app/opengraph-image";
import { createAnonClient } from "@/lib/supabase/anon";
import { buildEventOgImage, eventOgImageSize, resolveEventForOg } from "@/lib/event-og-image";

export const alt = "Event registration";
export const size = eventOgImageSize;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createAnonClient();
  const { data } = await supabase.rpc("public_event_by_slug", { p_slug: slug }).maybeSingle<{ event_id: string; org_slug: string }>();
  if (!data) return DefaultImage();
  const event = await resolveEventForOg(data.org_slug, data.event_id);
  if (!event) return DefaultImage();
  return buildEventOgImage(event);
}
