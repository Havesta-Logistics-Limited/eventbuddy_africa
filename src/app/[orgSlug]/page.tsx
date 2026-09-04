import type { Metadata } from "next";
import { createAnonClient } from "@/lib/supabase/anon";
import { OrgProfileContent } from "@/components/org-profile-content";

type Params = { orgSlug: string };

/** Server Component specifically so a shared organizer link carries their real
 *  name/bio instead of the site's generic default card — same reasoning as the
 *  event register/discover pages' own generateMetadata split. */
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { orgSlug } = await params;
  const supabase = createAnonClient();
  const { data } = await supabase.rpc("public_organization_profile", { org_slug: orgSlug }).maybeSingle<{ name: string; bio: string | null }>();
  if (!data) return {};

  return {
    title: data.name,
    description: data.bio || `Events by ${data.name} on eventbuddy.`,
    alternates: { canonical: `/${orgSlug}` },
    openGraph: { title: data.name, description: data.bio || `Events by ${data.name} on eventbuddy.` },
    twitter: { card: "summary", title: data.name, description: data.bio || `Events by ${data.name} on eventbuddy.` },
  };
}

export default async function OrgProfilePage({ params }: { params: Promise<Params> }) {
  const { orgSlug } = await params;
  return <OrgProfileContent orgSlug={orgSlug} />;
}
