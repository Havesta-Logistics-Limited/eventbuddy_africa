import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";

type Body = { email?: string; fullName?: string };

/**
 * Public, no-session — anyone can follow an org from its public page or a register
 * page's "Hosted By" card, the same trust model as self-service registration (the
 * service-role client is the actual boundary, not an auth check). Re-following after
 * a prior unsubscribe clears unsubscribed_at rather than erroring on the unique
 * constraint, so clicking Follow again always just works.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/follow">) {
  const { slug } = await ctx.params;
  const body = (await request.json().catch(() => null)) as Body | null;
  const email = body?.email?.trim().toLowerCase();
  const fullName = body?.fullName?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  if (!(await checkRateLimit(`org-follow:ip:${clientIp(request)}`, 20, 10 * 60))) {
    return rateLimitedResponse();
  }

  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("id, is_suspended").ilike("slug", slug).maybeSingle();
  if (!org) return NextResponse.json({ error: "No organization found for that link." }, { status: 404 });
  if (org.is_suspended) return NextResponse.json({ error: "This organizer isn't accepting followers right now." }, { status: 403 });

  const { error } = await admin
    .from("organization_followers")
    .upsert(
      { organization_id: org.id, email, full_name: fullName || null, unsubscribed_at: null },
      { onConflict: "organization_id,email" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
