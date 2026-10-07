import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatNaira } from "@/lib/billing";

/** "Exhibit at {event}": title and share card for an event's exhibitor page,
 *  so the link an organizer sends to businesses previews properly. */
export async function generateMetadata({ params }: { params: Promise<{ orgSlug: string }> }): Promise<Metadata> {
  const { orgSlug: slug } = await params;
  const admin = createAdminClient();
  const { data: e } = await admin
    .from("events")
    .select("id, name, date, venue, location, cover_image, published, exhibitors_enabled")
    .eq("slug", slug)
    .maybeSingle();
  if (!e?.published || !e.exhibitors_enabled) return { title: "Exhibit", robots: { index: false } };
  const { data: stands } = await admin.rpc("stand_availability", { p_event_id: e.id });
  const prices = ((stands ?? []) as { price_naira: number }[]).map((s) => Number(s.price_naira));
  const from = prices.length ? Math.min(...prices) : null;
  const when = new Date(`${e.date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const title = `Exhibit at ${e.name}`;
  const description = `Book a stand at ${e.name}, ${when}, ${[e.venue, e.location].filter(Boolean).join(", ")}. ${
    from === 0 ? "Free stands available." : from != null ? `Stands from ${formatNaira(from)}.` : ""
  } Apply online; the organizer confirms your stand.`.trim();
  const image = e.cover_image && /^https?:\/\//.test(e.cover_image) ? [e.cover_image] : undefined;
  return {
    title,
    description,
    alternates: { canonical: `/${slug}/exhibit` },
    openGraph: { title, description, url: `/${slug}/exhibit`, type: "website", images: image },
    twitter: { card: "summary_large_image", title, description, images: image },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
