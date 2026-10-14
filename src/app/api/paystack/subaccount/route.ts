import { NextResponse } from "next/server";
import { Resend } from "resend";
import { resolveRouteUser } from "@/lib/supabase/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePaystackAccount, createPaystackSubaccount, createTransferRecipient } from "@/lib/paystack";
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
      Your bank account is connected — ${escapeHtml(bankName)} · ${maskedAccount}. Ticket sales collect in your eventbuddy balance, minus the
      transaction fee, and you can request a payout to this account from your dashboard's Payouts page whenever money is available.
    </p>
    ${emailButton(dashboardUrl, "Go to your dashboard", "#0d7c6e")}
  `;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: "Your eventbuddy payouts are set up",
      text: `Payouts are set up — ${bankName} ${maskedAccount}. Request payouts to this account from your dashboard's Payouts page.`,
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
 * 'create' re-verifies (never trusts a client-supplied name) and saves it.
 *
 * Held funds (the model since 2026-10-07): the account is kept on record as
 * where eventbuddy sends the payouts an organizer requests and a platform
 * admin approves. No Paystack subaccount is created, so nothing is paid out
 * automatically; the account is registered as a Paystack transfer recipient
 * so the admin's Send button works first time. With held funds off (legacy),
 * a subaccount is created and sales split into it at checkout.
 */
export async function POST(request: Request) {
  const { user, supabase } = await resolveRouteUser(request);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json()) as Partial<Body>;
  const { action, bankCode, bankName, accountNumber } = body;

  const orgColumns = "id, name, paystack_subaccount_code, payout_account_number, payout_change_status, is_fee_exempt";
  let { data: org } = await supabase.from("organizations").select(orgColumns).eq("owner_user_id", user.id).maybeSingle();
  if (!org) {
    // Not the owner — an invited admin member manages payouts identically
    // (confirmed: full access, same as the owner). event_support members never
    // reach this route's UI and aren't granted it here either.
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .eq("status", "active")
      .maybeSingle();
    if (membership) {
      const { data: memberOrg } = await supabase.from("organizations").select(orgColumns).eq("id", membership.organization_id).maybeSingle();
      org = memberOrg;
    }
  }
  if (!org) return NextResponse.json({ error: "No organization found for this account." }, { status: 404 });

  if (action === "request-change") {
    if (!org.paystack_subaccount_code && !org.payout_account_number) {
      return NextResponse.json({ error: "You don't have a payout bank account yet, so there's nothing to change." }, { status: 400 });
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
  if ((org.paystack_subaccount_code || org.payout_account_number) && org.payout_change_status !== "approved") {
    return NextResponse.json({ error: "Request a payout change and wait for approval before updating your bank details." }, { status: 403 });
  }

  let accountName: string;
  try {
    ({ accountName } = await resolvePaystackAccount(accountNumber.trim(), bankCode));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't verify that account number." }, { status: 424 });
  }

  if (action !== "create") {
    return NextResponse.json({ accountName });
  }

  const admin = createAdminClient();
  const { data: settings } = await admin.from("platform_settings").select("ticket_fee_percentage, held_funds_enabled").eq("id", true).maybeSingle();
  const held = Boolean(settings?.held_funds_enabled);

  let subaccountCode: string | null = null;
  let recipientCode: string | null = null;
  if (held) {
    // On record for payouts. Registering it with Paystack now also proves it
    // can receive transfers; if Paystack is unavailable it's done at payout time.
    try {
      ({ recipientCode } = await createTransferRecipient({ name: accountName, accountNumber: accountNumber.trim(), bankCode }));
    } catch (err) {
      console.error(`[payout-account] couldn't register a transfer recipient for org ${org.id}; it'll be created at payout time:`, err instanceof Error ? err.message : err);
    }
  } else {
    // Legacy (held funds off): sales split into the organizer's own subaccount
    // at checkout. A fee-exempt org pays 0% commission on ticket sales too.
    const percentageCharge = org.is_fee_exempt ? 0 : Number(settings?.ticket_fee_percentage ?? 5);
    try {
      ({ subaccountCode } = await createPaystackSubaccount({
        businessName: org.name,
        bankCode,
        accountNumber: accountNumber.trim(),
        percentageCharge,
      }));
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't set up payouts." }, { status: 424 });
    }
  }

  const { error: updateError } = await admin
    .from("organizations")
    .update({
      // held: no subaccount, so no sale is ever split to this (or an older) account
      paystack_subaccount_code: subaccountCode,
      payout_bank_code: bankCode,
      payout_bank_name: bankName,
      payout_account_number: accountNumber.trim(),
      payout_account_name: accountName,
      payout_change_status: "none",
      payout_change_approved_at: null,
      // the new account's Paystack transfer recipient (or a fresh one at payout time)
      payout_recipient_code: recipientCode,
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
