import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveRouteUser } from "@/lib/supabase/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";
import { emailAdminsNewRequest, ID_TYPES, storeVerificationDoc } from "@/lib/verification";

const Schema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name as it appears on your ID.").max(120),
  businessName: z.string().trim().max(160).optional(),
  idType: z.enum(Object.keys(ID_TYPES) as [keyof typeof ID_TYPES, ...(keyof typeof ID_TYPES)[]]),
  idDocument: z.string().min(30).max(7_500_000),
  cacNumber: z.string().trim().max(40).optional(),
  cacDocument: z.string().max(7_500_000).optional(),
  socialLink: z.string().trim().max(300).optional(),
  note: z.string().trim().max(1000).optional(),
});

/** An organizer asks to be verified (0118): documents go to a private bucket,
 *  platform admins are emailed. One open request at a time. */
export async function POST(request: Request) {
  const { user, supabase } = await resolveRouteUser(request);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!(await checkRateLimit(`verification:ip:${clientIp(request)}`, 10, 60 * 60))) return rateLimitedResponse();
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the form and try again." }, { status: 400 });
  const d = parsed.data;

  // the organization this user owns (RLS-scoped helper)
  const { data: owned } = await supabase.rpc("owned_organization_ids");
  const orgId = (owned as string[] | null)?.[0];
  if (!orgId) return NextResponse.json({ error: "Only an organizer can ask to be verified." }, { status: 403 });

  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("id, name, payout_verified").eq("id", orgId).single();
  if (!org) return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  if (org.payout_verified) return NextResponse.json({ error: "Your account is already verified." }, { status: 409 });
  const { data: open } = await admin.from("organizer_verification_requests").select("id").eq("organization_id", orgId).eq("status", "pending").maybeSingle();
  if (open) return NextResponse.json({ error: "We're already reviewing your documents. We'll email you soon." }, { status: 409 });

  let social = d.socialLink || null;
  if (social && !/^https?:\/\//i.test(social)) social = `https://${social}`;

  const requestId = crypto.randomUUID();
  const idDoc = await storeVerificationDoc(admin, `${orgId}/${requestId}-id`, d.idDocument);
  if ("error" in idDoc) return NextResponse.json({ error: idDoc.error }, { status: 400 });
  let cacPath: string | null = null;
  if (d.cacDocument) {
    const cac = await storeVerificationDoc(admin, `${orgId}/${requestId}-cac`, d.cacDocument);
    if ("error" in cac) return NextResponse.json({ error: cac.error }, { status: 400 });
    cacPath = cac.path;
  }

  const { error } = await admin.from("organizer_verification_requests").insert({
    id: requestId,
    organization_id: orgId,
    full_name: d.fullName,
    business_name: d.businessName || null,
    id_type: d.idType,
    id_document_path: idDoc.path,
    cac_number: d.cacNumber || null,
    cac_document_path: cacPath,
    social_link: social,
    note: d.note || null,
  });
  if (error) {
    await admin.storage.from("verification-docs").remove([idDoc.path, ...(cacPath ? [cacPath] : [])]);
    return NextResponse.json({ error: error.code === "23505" ? "We're already reviewing your documents." : "Couldn't send your request. Please try again." }, { status: error.code === "23505" ? 409 : 500 });
  }
  await emailAdminsNewRequest(admin, org.name, process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin);
  return NextResponse.json({ success: true });
}
