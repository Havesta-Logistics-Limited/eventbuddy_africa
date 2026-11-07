import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Removes a campaign from Sent campaigns (platform admins only). Emails
 *  already delivered can't be recalled, and its pictures stay in storage so
 *  they keep showing in those emails. A campaign still sending stops: its next
 *  chunk finds nothing to send. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/platform/campaigns/[id]">) {
  const auth = await requirePlatformAdmin();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const { data, error } = await createAdminClient().from("platform_campaigns").delete().eq("id", id).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "That campaign couldn't be found." }, { status: 404 });
  return NextResponse.json({ success: true });
}
