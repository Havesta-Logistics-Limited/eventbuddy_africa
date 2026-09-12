import type { Metadata } from "next";
import { eventOgTitleAndDescription, resolveEventForOg } from "@/lib/event-og-image";

type Params = { orgSlug: string; event?: string[] };

/** Mirrors staff-setup/[[...event]]/layout.tsx — see that file's comment. */
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { orgSlug, event } = await params;
  const pinnedEvent = event?.[0];
  if (!pinnedEvent) return {};
  const resolved = await resolveEventForOg(orgSlug, pinnedEvent);
  const imageUrl = `/api/og/checkin?orgSlug=${encodeURIComponent(orgSlug)}&event=${encodeURIComponent(pinnedEvent)}&kind=rep`;
  if (!resolved) return { openGraph: { images: [imageUrl] } };
  const { title, description } = eventOgTitleAndDescription(resolved);
  return {
    title: `Rep check-in — ${title}`,
    description,
    openGraph: { title: `Rep check-in — ${title}`, description, images: [imageUrl] },
  };
}

export default function RepLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
