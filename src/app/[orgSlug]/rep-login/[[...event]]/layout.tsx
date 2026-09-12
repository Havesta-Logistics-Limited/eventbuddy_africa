import type { Metadata } from "next";

type Params = { orgSlug: string; event?: string[] };

/** Mirrors staff-setup/[[...event]]/layout.tsx — see that file's comment. */
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

export default function RepLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
