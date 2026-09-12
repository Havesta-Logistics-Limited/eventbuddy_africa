import type { Metadata } from "next";

type Params = { orgSlug: string; event?: string[] };

/** page.tsx in this segment is a client component ("use client"), which can't
 *  export generateMetadata itself — this server layout carries it instead, just
 *  to point openGraph.images at the shared /api/og/checkin route (see that
 *  file's comment for why this can't be a plain opengraph-image.tsx here). */
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { orgSlug, event } = await params;
  const pinnedEvent = event?.[0];
  if (!pinnedEvent) return {};
  return {
    openGraph: {
      images: [`/api/og/checkin?orgSlug=${encodeURIComponent(orgSlug)}&event=${encodeURIComponent(pinnedEvent)}`],
    },
  };
}

export default function StaffSetupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
