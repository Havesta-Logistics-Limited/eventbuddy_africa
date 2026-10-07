import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { ID_TYPES, nameMatch, type IdType } from "@/lib/verification";

/** Open verification requests with hints for the reviewer (0118): does the
 *  bank account name match, how old is the account, sales and refunds so far. */
export async function GET() {
  const auth = await requirePlatformAdmin();
  if ("response" in auth) return auth.response;
  const admin = createAdminClient();
  const { data: reqs } = await admin
    .from("organizer_verification_requests")
    .select("id, organization_id, full_name, business_name, id_type, cac_number, cac_document_path, social_link, note, created_at, organizations(name, email, created_at, payout_account_name, payout_bank_name)")
    .eq("status", "pending")
    .order("created_at");
  const out = await Promise.all(
    (reqs ?? []).map(async (r) => {
      const org = r.organizations as unknown as { name: string; email: string | null; created_at: string; payout_account_name: string | null; payout_bank_name: string | null } | null;
      const [{ data: sold }, { count: refunds }] = await Promise.all([
        admin.rpc("org_paid_tickets_sold", { p_org: r.organization_id }),
        admin.from("paystack_transactions").select("id", { count: "exact", head: true }).eq("organization_id", r.organization_id).in("status", ["refunded", "disputed"]),
      ]);
      return {
        id: r.id,
        orgId: r.organization_id,
        orgName: org?.name ?? "",
        orgEmail: org?.email ?? null,
        fullName: r.full_name,
        businessName: r.business_name,
        idType: ID_TYPES[r.id_type as IdType] ?? r.id_type,
        cacNumber: r.cac_number,
        hasCac: !!r.cac_document_path,
        socialLink: r.social_link,
        note: r.note,
        requestedAt: r.created_at,
        hints: {
          bankAccountName: org?.payout_account_name ?? null,
          bankName: org?.payout_bank_name ?? null,
          nameMatch: nameMatch(org?.payout_account_name ?? null, r.full_name, r.business_name, org?.name),
          accountAgeDays: org?.created_at ? Math.floor((Date.now() - new Date(org.created_at).getTime()) / 864e5) : null,
          paidTicketsSold: Number(sold ?? 0),
          refundsOrDisputes: refunds ?? 0,
        },
      };
    })
  );
  return NextResponse.json({ requests: out });
}
