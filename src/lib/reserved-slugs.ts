/** Every top-level static route this app serves — an org's public profile and,
 *  as of the short event-link format, an event's own register page both live at
 *  the root /[orgSlug] segment (see src/app/[orgSlug]/page.tsx), and Next only
 *  falls back to a dynamic segment when no static route matches, so an org or
 *  event slug equal to one of these would be permanently unreachable (shadowed
 *  by the static page instead). Checked at org signup (uniqueSlug) and when an
 *  organizer sets a custom event link (EventSlugEditor). */
export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "audience",
  "checkin",
  "collect",
  "contact",
  "dashboard",
  "discover",
  "events",
  "forgot-password",
  "leads",
  "login",
  "maintenance",
  "managed-events",
  "my-leads",
  "platform",
  "pricing",
  "privacy",
  "reset-password",
  "signup",
  "terms",
  "robots.txt",
  "sitemap.xml",
  "opengraph-image",
  "apple-icon.png",
  "icon.png",
  "favicon.ico",
]);
