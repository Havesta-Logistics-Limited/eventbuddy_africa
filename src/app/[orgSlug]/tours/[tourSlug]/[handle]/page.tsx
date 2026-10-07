import { notFound, redirect } from "next/navigation";
import { normalizeHandle } from "@/lib/promoters";

/** A promoter's tour link, eventbuddy.africa/<org>/tours/<tour>/<handle>
 *  (migration 0110). Hands over to the tour page with ?ref=<handle>, which
 *  carries it to whichever city's ticket page the buyer picks. */
export default async function PromoterTourLinkPage({ params }: { params: Promise<{ orgSlug: string; tourSlug: string; handle: string }> }) {
  const { orgSlug, tourSlug, handle: rawHandle } = await params;
  const handle = normalizeHandle(decodeURIComponent(rawHandle));
  if (!/^[a-z0-9_]{3,24}$/.test(handle)) notFound();
  redirect(`/${encodeURIComponent(orgSlug)}/tours/${encodeURIComponent(tourSlug)}?ref=${encodeURIComponent(handle)}`);
}
