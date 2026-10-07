import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPortal } from "@/lib/exhibitors";
import { uploadEventMediaAdmin } from "@/lib/supabase/storage";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";

const Schema = z.object({
  token: z.string(),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(80).optional(),
  website: z.string().trim().max(300).optional(),
  listed: z.boolean().optional(),
  // a new logo from the browser (compressed data URL), or "" to remove it
  logo: z.string().max(1_500_000).optional(),
});

/** The exhibitor edits their directory profile from the portal (0116). */
export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the details and try again." }, { status: 400 });
  if (!(await checkRateLimit(`exhibitor-profile:ip:${clientIp(request)}`, 60, 60 * 60))) return rateLimitedResponse();
  const admin = createAdminClient();
  const x = await loadPortal(admin, parsed.data.token);
  if (!x || x.status !== "paid") return NextResponse.json({ error: "This portal link isn't valid." }, { status: 404 });

  const d = parsed.data;
  const patch: Record<string, unknown> = {};
  if (d.description !== undefined) patch.description = d.description || null;
  if (d.category !== undefined) patch.category = d.category || null;
  if (d.listed !== undefined) patch.listed = d.listed;
  if (d.website !== undefined) {
    let w = d.website;
    if (w && !/^https?:\/\//i.test(w)) w = `https://${w}`;
    if (w && !/^https?:\/\/\S+\.\S+/.test(w)) return NextResponse.json({ error: "Enter a valid website address." }, { status: 400 });
    patch.website = w || null;
  }
  if (d.logo !== undefined) {
    if (d.logo === "") patch.logo_url = null;
    else {
      if (!/^data:image\/(png|jpe?g|webp);base64,/.test(d.logo)) return NextResponse.json({ error: "Upload a PNG, JPG or WebP image." }, { status: 400 });
      const url = await uploadEventMediaAdmin(admin, `${x.organization_id}/exhibitors/${x.id}`, d.logo);
      if (!url) return NextResponse.json({ error: "Couldn't upload the logo. Try a smaller image." }, { status: 502 });
      patch.logo_url = url;
    }
  }
  const { error } = await admin.from("exhibitors").update(patch).eq("id", x.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, logoUrl: patch.logo_url });
}
