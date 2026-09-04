"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { MapPinCheckInside } from "lucide-react";
import { PublicHeader, RegisterPageContent } from "@/components/register-page-content";

/**
 * The new universal public link format: eventbuddy.africa/discover/{event-slug} — no
 * org segment in the URL at all. Resolves which organization owns this slug first
 * (see /api/events/by-slug, migration 0057's globally-unique events.slug), then
 * mounts the exact same registration experience as the older org-scoped route.
 * That older route (/[orgSlug]/events/[eventId]/register) keeps working unchanged
 * for any link shared before this existed, or any event with no slug set.
 */
export default function DiscoverEventPage() {
  const { slug } = useParams<{ slug: string }>();
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/events/by-slug/${encodeURIComponent(slug)}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.orgSlug) setOrgSlug(json.orgSlug);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true));
  }, [slug]);

  if (notFound) {
    return (
      <div className="min-h-screen bg-slate-50">
        <PublicHeader />
        <div className="flex items-center justify-center p-6 py-32">
          <div className="text-center text-slate-500 max-w-sm">
            <p className="font-medium text-slate-700">This event couldn&apos;t be found.</p>
            <p className="text-sm mt-1">Check the link you were given and try again.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!orgSlug) {
    return (
      <div className="min-h-screen bg-slate-50">
        <PublicHeader />
        <div className="flex items-center justify-center py-32">
          <MapPinCheckInside size={26} className="text-[#C21FAF]/40 animate-pulse" />
        </div>
      </div>
    );
  }

  return <RegisterPageContent orgSlug={orgSlug} eventIdOrSlug={slug} />;
}
