import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAnonClient } from "@/lib/supabase/anon";
import { RegisterPageContent } from "@/components/register-page-content";
import { resolveEventForOg } from "@/lib/event-og-image";
import { formatDate, formatTime } from "@/lib/utils";

/**
 * eventbuddy.africa/{event-slug}/register: the short ticket link promoters
 * share (?ref=CODE is read on the page). Event slugs are unique across
 * eventbuddy (migration 0057), so the event name alone finds it. Takes
 * precedence over /[orgSlug]/[handle], and "register" is a reserved promoter
 * handle, so the two never collide.
 */

type Params = { orgSlug: string };

async function resolveEventOrgSlug(slug: string): Promise<string | null> {
  const { data } = await createAnonClient().rpc("public_event_by_slug", { p_slug: slug }).maybeSingle<{ event_id: string; org_slug: string }>();
  return data?.org_slug ?? null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { orgSlug: slug } = await params;
  const orgSlug = await resolveEventOrgSlug(slug);
  if (!orgSlug) return {};
  const event = await resolveEventForOg(orgSlug, slug);
  if (!event) return {};
  const whenWhere = [
    `${formatDate(event.date)}${event.startTime ? ` · ${formatTime(event.startTime)}` : ""}`,
    event.eventFormat === "virtual" ? event.virtualPlatform || "Virtual event" : [event.venue, event.location].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(" — ");
  return {
    title: event.name,
    description: whenWhere,
    // one canonical address for search engines; the ?ref= variants aren't separate pages
    alternates: { canonical: `/${slug}` },
    openGraph: { title: event.name, description: whenWhere },
    twitter: { card: "summary_large_image", title: event.name, description: whenWhere },
  };
}

export default async function ShortRegisterPage({ params }: { params: Promise<Params> }) {
  const { orgSlug: slug } = await params;
  const orgSlug = await resolveEventOrgSlug(slug);
  if (!orgSlug) notFound();
  return <RegisterPageContent orgSlug={orgSlug} eventIdOrSlug={slug} />;
}
