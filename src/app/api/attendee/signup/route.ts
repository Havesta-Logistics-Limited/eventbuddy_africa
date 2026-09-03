import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailButton, escapeHtml, renderEmailShell } from "@/lib/email-template";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";

/** Mobile-app attendee accounts — distinct from organizer signup (`/api/signup`), which
 *  also creates an `organizations` row. An attendee owns no organization/staff row, so
 *  every existing RLS ownership function (owned_organization_ids, is_platform_admin) is
 *  naturally inert for them; `account_type: "attendee"` in user_metadata just keeps the
 *  two kinds of account clearly labeled. Verification is code-based (not link-based)
 *  since the app has no universal-link setup yet — generateLink's `email_otp` is the
 *  same code Supabase would put in a magic-link email, just delivered through our own
 *  branded Resend template instead, exactly like the organizer welcome/verify email. */
async function sendVerificationEmail(to: string, firstName: string, code: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  const bodyHtml = `
    <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
    <p style="margin:0 0 16px;">Welcome to eventbuddy — enter this code in the app to verify your email and finish creating your account:</p>
    <p style="margin:0 0 24px; text-align:center;">
      <span style="display:inline-block; padding:16px 28px; border-radius:12px; background:#FFF3FD; color:#93147D; font-size:28px; font-weight:700; letter-spacing:0.15em; font-family:monospace;">${escapeHtml(code)}</span>
    </p>
    <p style="margin:0; color:#666; font-size:13px;">Didn't request this? You can safely ignore this email.</p>
  `;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: `Your eventbuddy verification code: ${code}`,
      text: `Your eventbuddy verification code is ${code}`,
      html: renderEmailShell({ color: "#C21FAF", label: "Verify your email", emoji: "🔐" }, bodyHtml),
    });
    return !error;
  } catch {
    return false;
  }
}

const AttendeeSignupSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name."),
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  phone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone number.")
    .max(20, "Enter a valid phone number.")
    .regex(/^[0-9+()\-\s]+$/, "Enter a valid phone number."),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = AttendeeSignupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input." }, { status: 400 });
  }
  const { fullName, email, password, phone } = parsed.data;

  if (!(await checkRateLimit(`attendee-signup:ip:${clientIp(request)}`, 5, 60 * 60))) {
    return rateLimitedResponse();
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY === "paste_your_supabase_service_role_key_here") {
    return NextResponse.json(
      { error: "Signup isn't configured yet. Add real Supabase keys to .env.local and restart the dev server." },
      { status: 500 }
    );
  }

  const supabase = createAdminClient();

  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: { data: { full_name: fullName, phone, account_type: "attendee" } },
  });
  if (linkError || !linkData.user) {
    return NextResponse.json({ error: linkError?.message || "Couldn't create that account." }, { status: 400 });
  }

  const code = linkData.properties?.email_otp;
  const firstName = fullName.trim().split(/\s+/)[0];
  const emailSent = code ? await sendVerificationEmail(email, firstName, code) : false;

  return NextResponse.json({ success: true, emailSent });
}
