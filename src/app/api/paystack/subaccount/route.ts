import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePaystackAccount, createPaystackSubaccount } from "@/lib/paystack";
import { emailButton, escapeHtml, renderEmailShell } from "@/lib/email-template";

type Body = { action: "resolve" | "create" | "request-change"; bankCode: string; bankName: string; accountNumber: string };

/** Best-effort confirmation once payouts are actually connected — fired server-side,
 *  right after the bank details are saved, so it's tied to the real state change
 *  rather than a client-side call that could be skipped on a slow connection. */
async function sendPayoutsConfiguredEmail(to: string, firstName: string, bankName: string, accountNumber: string, dashboardUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  const maskedAccount = `${"•".repeat(Math.max(accountNumber.length - 4, 0))}${accountNumber.slice(-4)}`;
  const bodyHtml = `
    <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
    <h1 style="font-size:19px; margin:0 0 12px;">Payouts are set up</h1>
    <p style="margin:0 0 20px; color:#666;">
      Your bank account is connected — ${escapeHtml(bankName)} · ${maskedAccount}. Every paid ticket sold from now on settles straight into it automatically,
      minus eventbuddy's transaction fee. eventbuddy never holds or forwards this money itself.
    </p>
    ${emailButton(dashboardUrl, "Go to your dashboard", "#0d7c6e")}
  `;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: "Your eventbuddy payouts are set up",
      text: `Payouts are set up — ${bankName} ${maskedAccount}. Ticket sales now split straight to this account automatically.`,
      html: renderEmailShell({ color: "#0d7c6e", label: "Payouts connected", emoji: "🏦" }, bodyHtml),
    });
    return !error;
  } catch {
    return false;
  }
}

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

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, paystack_subaccount_code, payout_change_status")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!org) return NextResponse.json({ error: "No organization found for this account." }, { status: 404 });

  if (action === "request-change") {
    if (!org.paystack_subaccount_code) {
      return NextResponse.json({ error: "You don't have payouts set up yet — there's nothing to change." }, { status: 400 });
    }
    const admin = createAdminClient();
    const { error: requestError } = await admin
      .from("organizations")
      .update({ payout_change_status: "requested", payout_change_requested_at: new Date().toISOString() })
      .eq("id", org.id);
    if (requestError) return NextResponse.json({ error: requestError.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (!bankCode || !bankName || !accountNumber?.trim()) {
    return NextResponse.json({ error: "Missing bank details." }, { status: 400 });
  }

  // A first-time setup is always allowed; a re-submission over an existing
  // subaccount is only allowed once a platform admin has approved a change request —
  // otherwise this route would be a way to silently redirect an org's revenue.
  if (org.paystack_subaccount_code && org.payout_change_status !== "approved") {
    return NextResponse.json({ error: "Request a payout change and wait for approval before updating your bank details." }, { status: 403 });
  }

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
      payout_change_status: "none",
      payout_change_approved_at: null,
    })
    .eq("id", org.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  if (user.email) {
    const fullName = (user.user_metadata?.full_name as string | undefined)?.trim();
    const firstName = fullName?.split(/\s+/)[0] || "there";
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    await sendPayoutsConfiguredEmail(user.email, firstName, bankName, accountNumber.trim(), `${siteUrl}/admin`);
  }

  return NextResponse.json({ success: true, accountName, subaccountCode });
}
