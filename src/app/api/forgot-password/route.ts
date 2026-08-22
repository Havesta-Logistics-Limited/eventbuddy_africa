import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

/** Best-effort branded reset email — mirrors sendVerificationEmail's shape/tone in
 *  src/app/api/signup/route.ts. Failure here is swallowed, same as the other
 *  transactional emails in this app; the caller always gets a generic success
 *  response either way (see the anti-enumeration note in the route handler below). */
async function sendResetEmail(to: string, resetUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: "Reset your eventbuddy password",
      text: `Reset your eventbuddy password: ${resetUrl}\n\nIf you didn't request this, you can safely ignore this email — your password won't change.`,
      html: `
        <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 420px; margin: 0 auto; color: #1e1b2e;">
          <p style="text-transform:uppercase; letter-spacing:0.06em; font-size:11px; color:#610064; font-weight:600; margin:0 0 8px;">Password reset</p>
          <h1 style="font-size:20px; margin:0 0 12px;">Reset your password</h1>
          <p style="margin:0 0 20px; color:#666; font-size:14px; line-height:1.5;">
            We got a request to reset your eventbuddy password. Click below to choose a new one — this link expires soon.
          </p>
          <a href="${resetUrl}" style="display:inline-block; padding:11px 20px; border-radius:8px; background:#610064; color:#ffffff; font-size:14px; font-weight:600; text-decoration:none;">
            Reset password
          </a>
          <p style="margin:20px 0 0; color:#999; font-size:12px;">Didn't request this? You can safely ignore this email — your password won't change.</p>
        </div>
      `,
    });
    return !error;
  } catch {
    return false;
  }
}

const ForgotPasswordSchema = z.object({ email: z.string().trim().email("Enter a valid email address.") });

/**
 * Deliberately always responds { success: true } once the email is well-formed —
 * confirming whether an account exists for it would let someone probe for
 * registered org-owner emails. Whether generateLink actually finds a matching
 * account (and thus whether an email goes out) never reaches the response.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = ForgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Enter a valid email address." }, { status: 400 });
  }
  const { email } = parsed.data;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY === "paste_your_supabase_service_role_key_here") {
    return NextResponse.json({ error: "Not configured yet." }, { status: 500 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: new URL("/reset-password", request.url).toString() },
  });

  if (!error && data.properties?.action_link) {
    await sendResetEmail(email, data.properties.action_link);
  }

  return NextResponse.json({ success: true });
}
