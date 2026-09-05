import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml, renderEmailShell } from "@/lib/email-template";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";

/** Regenerates a fresh verification code for an attendee stuck on the app's "Verify
 *  email" screen. Confirmed directly against Supabase (see session notes) that calling
 *  admin.generateLink({type:"signup", email, password}) again for an existing,
 *  still-unconfirmed user succeeds and returns a brand-new `email_otp`, WITHOUT
 *  overwriting their real password — the password argument is required by the API but
 *  is silently ignored once the user already exists, so a random throwaway value is
 *  safe to pass here. Already-confirmed accounts are rejected below before that call,
 *  since generateLink signup would otherwise error out on them anyway. */
async function sendVerificationEmail(to: string, firstName: string, code: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  const bodyHtml = `
    <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
    <p style="margin:0 0 16px;">Here's your new eventbuddy verification code:</p>
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

const ResendSchema = z.object({ email: z.string().trim().email("Enter a valid email address.") });

/** Raw REST call, not the typed SDK — supabase-js's admin.listUsers() doesn't expose an
 *  email filter, but the underlying GoTrue endpoint does (?email=...). */
async function findUserByEmail(email: string) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
  const res = await fetch(url, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const users = (json.users || json) as Array<{ id: string; email: string; confirmed_at?: string | null; user_metadata?: Record<string, unknown> }>;
  return users?.find((u) => u.email?.toLowerCase() === email.toLowerCase()) || null;
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = ResendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input." }, { status: 400 });
  }
  const { email } = parsed.data;

  if (!(await checkRateLimit(`attendee-resend:ip:${clientIp(request)}`, 10, 60 * 60))) {
    return rateLimitedResponse();
  }
  if (!(await checkRateLimit(`attendee-resend:email:${email.toLowerCase()}`, 3, 10 * 60))) {
    return rateLimitedResponse();
  }

  // Deliberately always responds { success: true } for a well-formed email —
  // same anti-enumeration reasoning as forgot-password: whether an account
  // exists at all, and whether it's already verified, never reaches the
  // response. The real conditional (does an unverified account exist, does a
  // code actually go out) only affects whether an email is sent, never what
  // the caller sees.
  const user = await findUserByEmail(email);
  if (user && !user.confirmed_at) {
    const supabase = createAdminClient();
    const { data: linkData } = await supabase.auth.admin.generateLink({
      type: "signup",
      email,
      password: `throwaway-${crypto.randomUUID()}`,
    });
    const code = linkData?.properties?.email_otp;
    if (code) {
      const firstName = ((user.user_metadata?.full_name as string) || "there").trim().split(/\s+/)[0];
      await sendVerificationEmail(email, firstName, code);
    }
  }

  return NextResponse.json({ success: true });
}
