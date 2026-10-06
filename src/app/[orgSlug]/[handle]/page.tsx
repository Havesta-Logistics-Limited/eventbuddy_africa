import { notFound, redirect } from "next/navigation";
import { createAnonClient } from "@/lib/supabase/anon";
import { normalizeHandle } from "@/lib/promoters";

/** A promoter's short share link, eventbuddy.africa/<event-slug>/<handle>
 *  (migration 0105). It hands over to the event's own page with ?ref=<handle>,
 *  where the existing referral capture remembers the promoter and counts the
 *  click; the sale is attributed to them at checkout. */
export default async function PromoterLinkPage({ params }: { params: Promise<{ orgSlug: string; handle: string }> }) {
  const { orgSlug: slug, handle: rawHandle } = await params;
  const handle = normalizeHandle(decodeURIComponent(rawHandle));
  if (!/^[a-z0-9_]{3,24}$/.test(handle)) notFound();

  const { data } = await createAnonClient().rpc("public_event_by_slug", { p_slug: slug }).maybeSingle<{ event_id: string; org_slug: string }>();
  if (!data) notFound();
  redirect(`/${encodeURIComponent(slug)}?ref=${encodeURIComponent(handle)}`);
}
