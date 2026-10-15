import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deactivatePaystackSubaccount } from "@/lib/paystack";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { emailButton, escapeHtml, renderEmailShell } from "@/lib/email-template";

/**
 * A platform admin removes an organizer's payout bank account: clears the
 * bank details, the Paystack transfer recipient and the subaccount link, and
 * switches the subaccount off at Paystack (best-effort). The organizer's held
 * balance is untouched; they add a new account to sell paid tickets and to be
 * paid out again, and are emailed the reason.
 *
 * Refused while a payout is waiting or being sent, so money in flight always
 * has a destination: approve or reject it first. Platform admins only, with
 * two-factor when set up.
 */

const Schema = z.object({
  orgId: z.string().uuid(),
  reason: z.string().trim().min(3, "Give the organizer a reason (at least 3 characters).").max(300),
});

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) return NextResponse.json({ error: "Only platform admins can do this." }, { status: 403 });

  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the details." }, { status: 400 });
  if (!(await checkRateLimit(`unlink-bank:user:${user.id}`, 30, 10 * 60))) return rateLimitedResponse();
  const { orgId, reason } = parsed.data;

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, name, email, owner_user_id, payout_bank_name, payout_account_number, paystack_subaccount_code")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) return NextResponse.json({ error: "Organizer not found." }, { status: 404 });
  if (!org.payout_account_number && !org.paystack_subaccount_code) {
    return NextResponse.json({ error: "This organizer has no bank account linked." }, { status: 400 });
  }

  const { count: inFlight } = await admin
    .from("payout_requests")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .in("status", ["requested", "processing"]);
  if (inFlight) {
    return NextResponse.json(
      { error: "This organizer has a payout waiting or being sent. Approve or reject it on the Payouts tab before unlinking their bank account." },
      { status: 409 }
    );
  }

  const last4 = (org.payout_account_number ?? "").slice(-4);
  const { error } = await admin
    .from("organizations")
    .update({
      payout_bank_code: null,
      payout_bank_name: null,
      payout_account_number: null,
      payout_account_name: null,
      payout_recipient_code: null,
      paystack_subaccount_code: null,
      payout_change_status: "none",
      payout_change_requested_at: null,
      payout_change_approved_at: null,
    })
    .eq("id", orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (org.paystack_subaccount_code) {
    try {
      await deactivatePaystackSubaccount(org.paystack_subaccount_code);
    } catch (err) {
      console.error(`[unlink-bank] org ${orgId}: bank unlinked, but switching off Paystack subaccount ${org.paystack_subaccount_code} failed; do it in the Paystack dashboard:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`[unlink-bank] org ${orgId} (${org.name}): ${org.payout_bank_name ?? "bank"} ••${last4} unlinked by ${user.id}: ${reason}`);

  // tell the organizer, at their contact email (or their login email)
  let to = org.email as string | null;
  if (!to && org.owner_user_id) {
    const { data } = await admin.auth.admin.getUserById(org.owner_user_id);
    to = data.user?.email ?? null;
  }
  let emailed = false;
  const apiKey = process.env.RESEND_API_KEY;
  if (to && apiKey && apiKey !== "paste_your_resend_api_key_here") {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const account = `${org.payout_bank_name ?? "your bank"}${last4 ? ` ••${last4}` : ""}`;
    try {
      const { error: mailError } = await new Resend(apiKey).emails.send({
        from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
        to,
        subject: "Your payout bank account was removed",
        text: `eventbuddy removed ${account} as ${org.name}'s payout bank account. Reason: ${reason}\n\nYour balance is safe. Add a bank account again in your dashboard (Settings → Payouts) to sell paid tickets and receive payouts: ${siteUrl}/admin?tab=payouts`,
        html: renderEmailShell(
          { color: "#C21FAF", label: "Payout account removed", emoji: "🏦" },
          `<p style="margin:0 0 14px;">eventbuddy removed <strong>${escapeHtml(account)}</strong> as <strong>${escapeHtml(org.name)}</strong>'s payout bank account.</p>
           <p style="margin:0 0 14px;"><strong>Reason:</strong> ${escapeHtml(reason)}</p>
           <p style="margin:0 0 20px;">Your balance is safe and nothing has been taken from it. Add a bank account again to sell paid tickets and receive payouts.</p>
           ${emailButton(`${siteUrl}/admin?tab=payouts`, "Add a bank account", "#C21FAF")}`
        ),
      });
      emailed = !mailError;
    } catch {
      emailed = false;
    }
  }

  return NextResponse.json({ success: true, emailed });
}
