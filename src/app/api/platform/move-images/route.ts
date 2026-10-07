import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { uploadEventMediaAdmin } from "@/lib/supabase/storage";

const BATCH = 15;

/** How many images are still stored inline (base64) in the database. */
async function remaining(admin: ReturnType<typeof createAdminClient>) {
  const [covers, speakers, logos] = await Promise.all([
    admin.from("events").select("id", { count: "exact", head: true }).like("cover_image", "data:%"),
    admin.from("event_speakers").select("id", { count: "exact", head: true }).like("photo_url", "data:%"),
    admin.from("organizations").select("id", { count: "exact", head: true }).like("logo_url", "data:%"),
  ]);
  return { covers: covers.count ?? 0, speakers: speakers.count ?? 0, logos: logos.count ?? 0 };
}

export async function GET() {
  const auth = await requirePlatformAdmin();
  if ("response" in auth) return auth.response;
  return NextResponse.json(await remaining(createAdminClient()));
}

/** Moves one batch of inline images (event covers, speaker photos, logos) into
 *  the event-media bucket and points the rows at the files. Call repeatedly
 *  until nothing is left; a row whose upload fails keeps its inline image. */
export async function POST() {
  const auth = await requirePlatformAdmin();
  if ("response" in auth) return auth.response;
  const admin = createAdminClient();
  let moved = 0;
  let failed = 0;

  const { data: events } = await admin.from("events").select("id, organization_id, cover_image").like("cover_image", "data:%").limit(BATCH);
  for (const e of events ?? []) {
    const url = await uploadEventMediaAdmin(admin, `${e.organization_id}/covers/${e.id}`, e.cover_image);
    if (url && !(await admin.from("events").update({ cover_image: url }).eq("id", e.id)).error) moved++;
    else failed++;
  }
  const { data: speakers } = await admin.from("event_speakers").select("id, organization_id, photo_url").like("photo_url", "data:%").limit(BATCH);
  for (const s of speakers ?? []) {
    const url = await uploadEventMediaAdmin(admin, `${s.organization_id}/speakers/${s.id}`, s.photo_url);
    if (url && !(await admin.from("event_speakers").update({ photo_url: url }).eq("id", s.id)).error) moved++;
    else failed++;
  }
  const { data: orgs } = await admin.from("organizations").select("id, logo_url").like("logo_url", "data:%").limit(BATCH);
  for (const o of orgs ?? []) {
    const url = await uploadEventMediaAdmin(admin, `${o.id}/logo`, o.logo_url);
    if (url && !(await admin.from("organizations").update({ logo_url: url }).eq("id", o.id)).error) moved++;
    else failed++;
  }
  return NextResponse.json({ moved, failed, remaining: await remaining(admin) });
}
