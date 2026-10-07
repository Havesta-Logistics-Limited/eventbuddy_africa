import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

/** Keeps every private/organization-scoped surface out of search results — the admin
 *  dashboard, staff/rep check-in links, and attendee registration pages are meant to
 *  be reached only via a direct link an organizer shares (or after signing in), never
 *  discovered through search. See sitemap.ts for the pages that ARE meant to be found. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/admin",
        "/audience",
        "/events",
        "/leads",
        "/collect",
        "/checkin",
        "/my-leads",
        "/platform",
        "/login",
        "/signup",
        "/forgot-password",
        "/reset-password",
        "/api/",
        // signed-in areas added with held funds, promoters and tours (2026-10).
        // The exhibitor portal and stand payment pages are NOT listed: they
        // carry a noindex tag instead, which crawlers can only see if allowed in.
        "/payouts",
        "/promoter",
        "/tours/",
        "/*/staff-setup",
        "/*/rep-login",
        "/*/events/*/register",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
