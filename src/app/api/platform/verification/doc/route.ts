import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { VERIFICATION_BUCKET } from "@/lib/verification";

/** Platform admins open a request's ID or CAC document through a signed link
 *  that expires in 2 minutes; the bucket itself is private. */
export async function GET(request: Request) {
  const auth = await requirePlatformAdmin();
  if ("response" in auth) return auth.response;
  const url = new URL(request.url);
  const requestId = url.searchParams.get("requestId") ?? "";
  const kind = url.searchParams.get("kind") === "cac" ? "cac" : "id";
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const admin = createAdminClient();
  const { data: req } = await admin.from("organizer_verification_requests").select("id_document_path, cac_document_path").eq("id", requestId).maybeSingle();
  const path = kind === "cac" ? req?.cac_document_path : req?.id_document_path;
  if (!path) return NextResponse.json({ error: "No document." }, { status: 404 });
  const { data, error } = await admin.storage.from(VERIFICATION_BUCKET).createSignedUrl(path, 120);
  if (error || !data) return NextResponse.json({ error: "Couldn't open the document." }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
