import type { MetadataRoute } from "next";
import { createAnonClient } from "@/lib/supabase/anon";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// Without this, Next.js would try to statically freeze this route at build time —
// fine for the hardcoded marketing pages, wrong for the event list below, which
// changes constantly as organizers publish new events. Hourly is plenty fresh for
// how often crawlers actually re-fetch a sitemap.
export const revalidate = 3600;

/** The public marketing pages plus every currently-discoverable event (see
 *  /discover and migration 0057's global event slugs) — those are real, meant-to-
 *  be-found public pages now, unlike the org-scoped attendee registration links
 *  (/[orgSlug]/events/[eventId]/register), which stay out of both this file and
 *  search entirely (see robots.ts) since they're meant to be reached only via a
 *  direct link an organizer shares. Everything else (dashboard, admin, staff/rep
 *  check-in links) is behind auth or a private link either way. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }[] = [
    { path: "", changeFrequency: "daily", priority: 1 },
    { path: "/discover", changeFrequency: "daily", priority: 0.9 },
    { path: "/pricing", changeFrequency: "monthly", priority: 0.5 },
    { path: "/managed-events", changeFrequency: "monthly", priority: 0.7 },
    { path: "/privacy", changeFrequency: "monthly", priority: 0.3 },
    { path: "/terms", changeFrequency: "monthly", priority: 0.3 },
  ];

  const staticEntries: MetadataRoute.Sitemap = staticPages.map(({ path, changeFrequency, priority }) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
    changeFrequency,
    priority,
  }));

  // Only events with a global slug have a /discover/[slug] URL at all — anything
  // without one is only reachable via its org-scoped link, which stays unlisted.
  const supabase = createAnonClient();
  const { data: events } = await supabase.rpc("public_discover_events");
  const eventEntries: MetadataRoute.Sitemap = ((events ?? []) as { slug: string | null }[])
    .filter((e) => e.slug)
    .map((e) => ({
      url: `${siteUrl}/discover/${e.slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    }));

  return [...staticEntries, ...eventEntries];
}
