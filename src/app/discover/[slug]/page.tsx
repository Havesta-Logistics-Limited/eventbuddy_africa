import { permanentRedirect } from "next/navigation";

type Params = { slug: string };

/**
 * /discover/[slug] used to be the universal short link for an event; it's now
 * /[slug] directly (src/app/[orgSlug]/page.tsx resolves org profiles and event
 * slugs at that one root segment). Every link already sent in a confirmation
 * email, printed on a badge, or indexed by a search engine still needs to work,
 * so this redirects rather than 404ing — permanently (308), since the new form
 * is the real canonical one from here on, not a temporary detour.
 */
export default async function DiscoverEventRedirect({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  permanentRedirect(`/${slug}`);
}
