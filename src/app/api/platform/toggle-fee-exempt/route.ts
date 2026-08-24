import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updatePaystackSubaccountPercentage } from "@/lib/paystack";

const Schema = z.object({ orgId: z.string().uuid(), exempt: z.boolean() });

/**
 * Flips an org's is_fee_exempt AND, if they already have payouts set up, updates
 * their live Paystack subaccount's percentage_charge to match — otherwise toggling
 * exemption here would only change wording, since percentage_charge is fixed at
 * subaccount-creation time and never revisited on its own. Same auth-check pattern
 * as /api/platform/delete-org.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  const { orgId, exempt } = parsed.data;

  const supabase = await createServerClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: membership } = await supabase.from("platform_admins").select("user_id").eq("user_id", caller.id).maybeSingle();
  if (!membership) return NextResponse.json({ error: "Only platform admins can do this." }, { status: 403 });

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY === "paste_your_supabase_service_role_key_here") {
    return NextResponse.json({ error: "Not configured yet." }, { status: 500 });
  }

  const admin = createAdminClient();
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select("id, name, paystack_subaccount_code, payout_bank_code, payout_account_number")
    .eq("id", orgId)
    .maybeSingle();
  if (orgError) return NextResponse.json({ error: orgError.message }, { status: 500 });
  if (!org) return NextResponse.json({ error: "Organization not found." }, { status: 404 });

  const { error: updateError } = await admin.from("organizations").update({ is_fee_exempt: exempt }).eq("id", orgId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  if (org.paystack_subaccount_code && org.payout_bank_code && org.payout_account_number) {
    let targetPercentage = 0;
    if (!exempt) {
      const { data: settings } = await admin.from("platform_settings").select("ticket_fee_percentage").eq("id", true).maybeSingle();
      targetPercentage = Number(settings?.ticket_fee_percentage ?? 5);
    }
    try {
      await updatePaystackSubaccountPercentage({
        subaccountCode: org.paystack_subaccount_code,
        businessName: org.name,
        bankCode: org.payout_bank_code,
        accountNumber: org.payout_account_number,
        percentageCharge: targetPercentage,
      });
    } catch (err) {
      // The exemption flag itself already saved — the platform admin's decision
      // should stick even if the Paystack sync failed, so this surfaces as a
      // separate warning rather than rolling the flag back.
      return NextResponse.json(
        {
          success: true,
          warning: `Exemption saved, but the commission rate on Paystack couldn't be updated: ${err instanceof Error ? err.message : "unknown error"}`,
        },
        { status: 200 }
      );
    }
  }

  return NextResponse.json({ success: true });
}
