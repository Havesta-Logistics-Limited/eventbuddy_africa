import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Deletes an imported list and its contacts (past campaigns keep their record). */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/platform/campaigns/lists/[id]">) {
  const auth = await requirePlatformAdmin();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const { error } = await createAdminClient().from("platform_contact_lists").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
