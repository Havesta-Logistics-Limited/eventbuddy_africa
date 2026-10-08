import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
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
 *  check-in links) is behind auth or a private link either way.
 *
 *  Event URLs point at the short /[slug] form (src/app/[orgSlug]/page.tsx), not
 *  /discover/[slug] — that older path still works (redirects here) but was never
 *  the one worth telling search engines about once the short form existed. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }[] = [
    { path: "", changeFrequency: "daily", priority: 1 },
    { path: "/discover", changeFrequency: "daily", priority: 0.9 },
    { path: "/create", changeFrequency: "monthly", priority: 0.8 },
    { path: "/pricing", changeFrequency: "monthly", priority: 0.5 },
    { path: "/promote", changeFrequency: "monthly", priority: 0.6 },
    { path: "/marketplace", changeFrequency: "daily", priority: 0.6 },
    { path: "/company", changeFrequency: "monthly", priority: 0.7 },
    { path: "/contact", changeFrequency: "yearly", priority: 0.3 },
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

  // Only events with a global slug have a short /[slug] URL at all — anything
  // without one is only reachable via its org-scoped link, which stays unlisted.
  const supabase = createAnonClient();
  const { data: events } = await supabase.rpc("public_discover_events");
  const eventEntries: MetadataRoute.Sitemap = ((events ?? []) as { slug: string | null }[])
    .filter((e) => e.slug)
    .map((e) => ({
      url: `${siteUrl}/${e.slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    }));

  // Public tour pages and exhibitor pages (2026-10). These need rows anon
  // can't list, so they're read with the service role, safe columns only.
  const admin = createAdminClient();
  const [{ data: tours }, { data: exhibitEvents }] = await Promise.all([
    admin.from("tours").select("slug, organizations(slug), events!inner(published)").eq("events.published", true),
    admin.from("events").select("slug").eq("published", true).eq("exhibitors_enabled", true).not("slug", "is", null),
  ]);
  const tourEntries: MetadataRoute.Sitemap = ((tours ?? []) as unknown as { slug: string; organizations: { slug: string } | null }[])
    .filter((t) => t.organizations?.slug)
    .map((t) => ({ url: `${siteUrl}/${t.organizations!.slug}/tours/${t.slug}`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: 0.6 }));
  const exhibitEntries: MetadataRoute.Sitemap = ((exhibitEvents ?? []) as { slug: string }[]).map((e) => ({
    url: `${siteUrl}/${e.slug}/exhibit`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.5,
  }));

  return [...staticEntries, ...eventEntries, ...tourEntries, ...exhibitEntries];
}
