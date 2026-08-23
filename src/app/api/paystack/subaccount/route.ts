import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePaystackAccount, createPaystackSubaccount } from "@/lib/paystack";

type Body = { action: "resolve" | "create"; bankCode: string; bankName: string; accountNumber: string };

/**
 * Two-step payout onboarding for an org admin, both steps behind a real signed-in
 * session (owned via organizations.owner_user_id, same trust boundary as every other
 * org-admin write): 'resolve' verifies the account number against the bank and shows
 * the real account holder name for the admin to confirm before anything is saved;
 * 'create' re-verifies (never trusts a client-supplied name) and then creates the
 * Paystack Subaccount that all of this org's future ticket sales split into.
 */
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json()) as Partial<Body>;
  const { action, bankCode, bankName, accountNumber } = body;
  if (!bankCode || !bankName || !accountNumber?.trim()) {
    return NextResponse.json({ error: "Missing bank details." }, { status: 400 });
  }

  const { data: org } = await supabase.from("organizations").select("id, name").eq("owner_user_id", user.id).maybeSingle();
  if (!org) return NextResponse.json({ error: "No organization found for this account." }, { status: 404 });

  let accountName: string;
  try {
    ({ accountName } = await resolvePaystackAccount(accountNumber.trim(), bankCode));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't verify that account number." }, { status: 502 });
  }

  if (action !== "create") {
    return NextResponse.json({ accountName });
  }

  const admin = createAdminClient();
  const { data: settings } = await admin.from("platform_settings").select("ticket_fee_percentage").eq("id", true).maybeSingle();
  const percentageCharge = Number(settings?.ticket_fee_percentage ?? 5);

  let subaccountCode: string;
  try {
    ({ subaccountCode } = await createPaystackSubaccount({
      businessName: org.name,
      bankCode,
      accountNumber: accountNumber.trim(),
      percentageCharge,
    }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't set up payouts." }, { status: 502 });
  }

  const { error: updateError } = await admin
    .from("organizations")
    .update({
      paystack_subaccount_code: subaccountCode,
      payout_bank_code: bankCode,
      payout_bank_name: bankName,
      payout_account_number: accountNumber.trim(),
      payout_account_name: accountName,
    })
    .eq("id", org.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ success: true, accountName, subaccountCode });
}
