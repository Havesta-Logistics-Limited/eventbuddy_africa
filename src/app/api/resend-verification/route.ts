import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailButton, escapeHtml, renderEmailShell } from "@/lib/email-template";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";

const Schema = z.object({ email: z.string().trim().email() });

/**
 * "Resend email" on the sign-up check-your-email screen (organizers and
 * promoters). Public, so it never says whether an account exists, and it
 * only ever emails an account that is still unverified.
 *
 * Uses a one-time magic link rather than a "signup" link: generating a signup
 * link for an existing user needs a password and would overwrite the one they
 * just chose. Following a magic link confirms the email the same way.
 */
export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const email = parsed.data.email.toLowerCase();

  if (!(await checkRateLimit(`resend-verification:email:${email}`, 3, 60 * 60))) return rateLimitedResponse();
  if (!(await checkRateLimit(`resend-verification:ip:${clientIp(request)}`, 10, 60 * 60))) return rateLimitedResponse();

  const generic = NextResponse.json({ success: true });
  const admin = createAdminClient();
  // Only an existing, still-unverified account (migration 0107): the magic-link
  // generator below would otherwise create a brand-new user for any address.
  const { data: status } = await admin.rpc("auth_user_status", { p_email: email }).maybeSingle<{ user_id: string; confirmed: boolean }>();
  if (!status || status.confirmed) return generic;

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: new URL("/login?verified=1", request.url).toString() },
  });
  // No such account, or it's already verified: say nothing either way.
  if (error || !data.user || data.user.email_confirmed_at || !data.properties?.action_link) return generic;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") {
    return NextResponse.json({ error: "Email isn't configured on this server." }, { status: 500 });
  }
  const firstName = ((data.user.user_metadata?.full_name as string | undefined) || "there").trim().split(/\s+/)[0];
  const bodyHtml = `
    <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
    <p style="margin:0 0 20px; color:#666;">Here's your new link. Click below to verify your email and activate your eventbuddy account.</p>
    ${emailButton(data.properties.action_link, "Verify email", "#C21FAF")}
  `;
  try {
    const { error: sendError } = await new Resend(apiKey).emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to: email,
      subject: "Verify your eventbuddy account",
      text: `Verify your email to activate your eventbuddy account: ${data.properties.action_link}`,
      html: renderEmailShell({ color: "#C21FAF", label: "Verify your email", emoji: "📧" }, bodyHtml),
    });
    if (sendError) throw new Error(sendError.message);
  } catch {
    return NextResponse.json({ error: "We couldn't send the email just now. Check your connection and try again in a minute." }, { status: 502 });
  }
  return generic;
}
