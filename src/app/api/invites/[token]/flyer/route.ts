import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupInvite } from "@/lib/invite-lookup";
import { renderInviteFlyer } from "@/lib/invite-flyer";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";

/** One guest's invitation flyer with their entry QR (migration 0136). ?download=1 saves it as a file. */
export async function GET(request: Request, ctx: RouteContext<"/api/invites/[token]/flyer">) {
  const { token } = await ctx.params;
  if (!(await checkRateLimit(`invite-flyer:ip:${clientIp(request)}`, 600, 10 * 60))) return rateLimitedResponse();
  const invite = await lookupInvite(createAdminClient(), token);
  if (!invite || !invite.design || !invite.referenceId) {
    return NextResponse.json({ error: "This invitation isn't available." }, { status: 404 });
  }
  const image = await renderInviteFlyer(invite.design, invite.guestName, invite.referenceId);
  const body = await image.arrayBuffer();
  const download = new URL(request.url).searchParams.get("download") === "1";
  const file = `${invite.event.name}-${invite.guestName}`.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "invitation";
  return new Response(body, {
    headers: {
      "Content-Type": "image/png",
      // private: it carries the guest's entry QR
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
      ...(download ? { "Content-Disposition": `attachment; filename="${file}.png"` } : {}),
    },
  });
}
