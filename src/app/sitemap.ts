import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

/** Only the public marketing pages — everything else (dashboard, admin, per-org event
 *  pages, staff/rep check-in links, attendee registration links) is either behind auth
 *  or meant to be reached only via a direct link an organizer shares, never surfaced
 *  in search. See robots.ts for the matching disallow rules. */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", "/pricing", "/privacy", "/terms"];
  return pages.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.5,
  }));
}
