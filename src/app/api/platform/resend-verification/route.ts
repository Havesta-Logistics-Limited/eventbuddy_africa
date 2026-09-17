import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailButton, escapeHtml, renderEmailShell } from "@/lib/email-template";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";

/** Same "Welcome" email as signup, minus the letter — this is a reminder to click
 *  the button, not a re-introduction. Reuses the exact verify-email styling the
 *  original send used, so a re-sent link still looks like it came from the same
 *  place. */
async function sendVerificationReminderEmail(to: string, firstName: string, verifyUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  const bodyHtml = `
    <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
    <p style="margin:0 0 20px; color:#666;">
      You're almost set up on eventbuddy — your account just needs one more step. Click below to verify your email and activate your account.
    </p>
    ${emailButton(verifyUrl, "Verify email", "#C21FAF")}
  `;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: "Verify your eventbuddy account",
      text: `Verify your email to activate your eventbuddy account: ${verifyUrl}`,
      html: renderEmailShell({ color: "#C21FAF", label: "Verify your email", emoji: "📧" }, bodyHtml),
    });
    return !error;
  } catch {
    return false;
  }
}

const Schema = z.object({ orgId: z.string().uuid() });

/**
 * Re-sends the org owner's original signup confirmation email — for an owner who
 * missed/lost the first one and is stuck "Unverified" with no way to trigger
 * another themselves (there's no "resend" control on their own side; this only
 * exists here, platform-admin-triggered). Mirrors attendee/resend-code's proven
 * trick: calling generateLink({type:"signup", email, password}) again for an
 * already-existing, still-unconfirmed user succeeds and returns a brand-new
 * action_link without touching their real password.
 *
 * Resolves the email from the AUTH user (admin.auth.admin.getUserById), not
 * organizations.email — those two can diverge (see login_email_change_status),
 * and the confirmation has to go to whatever address Supabase will actually
 * accept a login for, not the org's separate contact email.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  const { orgId } = parsed.data;

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

  if (!(await checkRateLimit(`platform-resend-verification:ip:${clientIp(request)}`, 20, 60 * 60))) {
    return rateLimitedResponse();
  }
  if (!(await checkRateLimit(`platform-resend-verification:org:${orgId}`, 3, 10 * 60))) {
    return rateLimitedResponse();
  }

  const admin = createAdminClient();
  const { data: org, error: orgError } = await admin.from("organizations").select("id, owner_user_id, name, is_verified").eq("id", orgId).maybeSingle();
  if (orgError || !org) return NextResponse.json({ error: orgError?.message || "Organization not found." }, { status: 404 });
  if (org.is_verified) return NextResponse.json({ error: "This organization is already verified." }, { status: 400 });

  const { data: ownerData, error: ownerError } = await admin.auth.admin.getUserById(org.owner_user_id);
  if (ownerError || !ownerData.user?.email) return NextResponse.json({ error: "Couldn't find this organization's owner account." }, { status: 404 });
  const email = ownerData.user.email;
  const firstName = ((ownerData.user.user_metadata?.full_name as string | undefined) || "there").trim().split(/\s+/)[0];

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "signup",
    email,
    password: `throwaway-${crypto.randomUUID()}`,
  });
  if (linkError || !linkData.properties?.action_link) {
    return NextResponse.json({ error: linkError?.message || "Couldn't generate a new verification link." }, { status: 500 });
  }

  const sent = await sendVerificationReminderEmail(email, firstName, linkData.properties.action_link);
  if (!sent) return NextResponse.json({ error: "Couldn't send the email. Check the Resend configuration." }, { status: 502 });

  return NextResponse.json({ success: true, email });
}
