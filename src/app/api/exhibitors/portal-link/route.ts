import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveRouteUser } from "@/lib/supabase/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailPortalLink, exhibitorPortalUrl } from "@/lib/exhibitors";

const Schema = z.object({ exhibitorId: z.string().uuid() });

/** The organizer re-sends a paid exhibitor their portal link. */
export async function POST(request: Request) {
  const { user, supabase } = await resolveRouteUser(request);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { data: mine } = await supabase.from("exhibitors").select("id").eq("id", parsed.data.exhibitorId).maybeSingle();
  if (!mine) return NextResponse.json({ error: "Exhibitor not found." }, { status: 404 });
  const { data: x } = await createAdminClient()
    .from("exhibitors")
    .select("status, email, company_name, contact_name, portal_token, events(name), stand_types(name)")
    .eq("id", parsed.data.exhibitorId)
    .single();
  if (!x || x.status !== "paid") return NextResponse.json({ error: "The portal opens once their stand is paid for." }, { status: 409 });
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const sent = await emailPortalLink(x.email, {
    company: x.company_name,
    contact: x.contact_name,
    eventName: (x.events as unknown as { name: string } | null)?.name ?? "the event",
    standName: (x.stand_types as unknown as { name: string } | null)?.name ?? "Stand",
    portalUrl: exhibitorPortalUrl(siteUrl, x.portal_token),
  });
  if (!sent) return NextResponse.json({ error: "Couldn't send the email. Copy the link and send it yourself." }, { status: 502 });
  return NextResponse.json({ success: true });
}
