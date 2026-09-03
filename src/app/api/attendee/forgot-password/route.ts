import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml, renderEmailShell } from "@/lib/email-template";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";

/** Same code-based pattern as attendee signup/resend, using generateLink's `recovery`
 *  type instead of `signup` — the mobile app has no universal-link handling yet (see
 *  0050_attendee_accounts.sql / signup route notes), so a link-based reset email
 *  wouldn't open anywhere useful; a code the user types into app/(auth)/reset-password
 *  works today. Always returns success regardless of whether the account exists, so
 *  this can't be used to enumerate registered emails. */
async function sendResetEmail(to: string, code: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  const bodyHtml = `
    <p style="margin:0 0 16px;">Use this code in the app to reset your password:</p>
    <p style="margin:0 0 24px; text-align:center;">
      <span style="display:inline-block; padding:16px 28px; border-radius:12px; background:#f1f5f9; color:#1e1b2e; font-size:28px; font-weight:700; letter-spacing:0.15em; font-family:monospace;">${escapeHtml(code)}</span>
    </p>
    <p style="margin:0; color:#666; font-size:13px;">Didn't request this? You can safely ignore this email — your password won't change.</p>
  `;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: `Your eventbuddy password reset code: ${code}`,
      text: `Your eventbuddy password reset code is ${code}`,
      html: renderEmailShell({ color: "#170821", label: "Password reset", emoji: "🔑" }, bodyHtml),
    });
    return !error;
  } catch {
    return false;
  }
}

const Schema = z.object({ email: z.string().trim().email("Enter a valid email address.") });

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input." }, { status: 400 });
  }
  const { email } = parsed.data;

  if (!(await checkRateLimit(`attendee-forgot-password:ip:${clientIp(request)}`, 10, 60 * 60))) {
    return rateLimitedResponse();
  }
  if (!(await checkRateLimit(`attendee-forgot-password:email:${email.toLowerCase()}`, 3, 10 * 60))) {
    return rateLimitedResponse();
  }

  const supabase = createAdminClient();
  const { data: linkData } = await supabase.auth.admin.generateLink({ type: "recovery", email });

  // No account with that email — generateLink errors, but the response stays generic.
  if (linkData?.properties?.email_otp) {
    await sendResetEmail(email, linkData.properties.email_otp);
  }

  return NextResponse.json({ success: true });
}
