import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { organizerTicketFee } from "@/lib/org-fee";

/**
 * An organizer's commission (migration 0126). GET ?orgId= returns the rate
 * they're charged now and where it comes from (exempt / custom / plan /
 * default), plus any custom agreement. POST sets a custom rate with a note, or
 * clears it (percentage and flatNaira both null) to return to the standard
 * rate. Applies from the next sale; past sales keep the fee they were charged.
 * Platform admins only, with two-factor when set up.
 */

async function authorize() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  const { data: ok } = await supabase.rpc("is_platform_admin");
  if (!ok) return { response: NextResponse.json({ error: "Only platform admins can change commission." }, { status: 403 }) };
  return { userId: user.id };
}

async function current(orgId: string) {
  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, name, is_fee_exempt, custom_fee_percentage, custom_fee_flat_naira, custom_fee_note, custom_fee_set_at")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) return null;
  const effective = await organizerTicketFee(admin, orgId);
  // what they'd pay without the custom rate, for comparison
  const { data: settings } = await admin.from("platform_settings").select("ticket_fee_percentage, ticket_fee_flat_naira").eq("id", true).maybeSingle();
  const { data: planRow } = await admin.from("organizer_plans").select("name, fee_percentage, fee_flat_naira").eq("id", effective.planId).maybeSingle();
  const standard = {
    percentage: planRow?.fee_percentage != null ? Number(planRow.fee_percentage) : Number(settings?.ticket_fee_percentage ?? 5),
    flatNaira: planRow?.fee_flat_naira != null ? Number(planRow.fee_flat_naira) : Number(settings?.ticket_fee_flat_naira ?? 100),
  };
  return {
    orgId: org.id,
    orgName: org.name,
    effective: effective.fee,
    source: effective.source,
    plan: planRow?.name ?? effective.planId,
    standard,
    custom:
      org.custom_fee_percentage != null
        ? { percentage: Number(org.custom_fee_percentage), flatNaira: Number(org.custom_fee_flat_naira), note: org.custom_fee_note, setAt: org.custom_fee_set_at }
        : null,
    feeExempt: org.is_fee_exempt,
  };
}

export async function GET(request: Request) {
  const auth = await authorize();
  if ("response" in auth) return auth.response;
  const orgId = new URL(request.url).searchParams.get("orgId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) return NextResponse.json({ error: "Missing organizer." }, { status: 400 });
  const c = await current(orgId);
  if (!c) return NextResponse.json({ error: "Organizer not found." }, { status: 404 });
  return NextResponse.json(c);
}

const Schema = z.union([
  z.object({
    orgId: z.string().uuid(),
    percentage: z.number().min(0, "The percentage can't be negative.").max(50, "The percentage can be at most 50%."),
    flatNaira: z.number().min(0, "The flat amount can't be negative.").max(100000, "The flat amount can be at most ₦100,000."),
    note: z.string().trim().min(3, "Note the agreement (at least 3 characters), e.g. who agreed it and why.").max(500),
  }),
  z.object({ orgId: z.string().uuid(), percentage: z.null(), flatNaira: z.null(), note: z.string().optional() }),
]);

export async function POST(request: Request) {
  const auth = await authorize();
  if ("response" in auth) return auth.response;
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues.find((i) => i.code !== "invalid_union") ?? parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Check the rate." }, { status: 400 });
  }
  if (!(await checkRateLimit(`org-fee:user:${auth.userId}`, 30, 10 * 60))) return rateLimitedResponse();
  const b = parsed.data;
  const clearing = b.percentage === null;

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update(
      clearing
        ? { custom_fee_percentage: null, custom_fee_flat_naira: null, custom_fee_note: null, custom_fee_set_at: null, custom_fee_set_by: null }
        : {
            custom_fee_percentage: Math.round(b.percentage * 100) / 100,
            custom_fee_flat_naira: Math.round(b.flatNaira * 100) / 100,
            custom_fee_note: b.note,
            custom_fee_set_at: new Date().toISOString(),
            custom_fee_set_by: auth.userId,
          }
    )
    .eq("id", b.orgId);
  if (error) {
    const missing = /custom_fee/.test(error.message);
    return NextResponse.json({ error: missing ? "This needs migration 0126 to be run on this database." : error.message }, { status: 500 });
  }
  console.log(`[org-fee] org ${b.orgId}: ${clearing ? "custom rate cleared" : `custom rate ${b.percentage}% + ₦${b.flatNaira}`} by ${auth.userId}${clearing ? "" : `: ${b.note}`}`);
  return NextResponse.json(await current(b.orgId));
}
