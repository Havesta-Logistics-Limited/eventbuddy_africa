import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { normalizePhone } from "@/lib/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailButton, escapeHtml, renderEmailShell } from "@/lib/email-template";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";
import { validateHandle } from "@/lib/promoters";

async function sendPromoterWelcome(to: string, firstName: string, handle: string, verifyUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;
  const bodyHtml = `
    <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
    <h1 style="font-size:19px; margin:0 0 12px;">Welcome to eventbuddy, @${escapeHtml(handle)}</h1>
    <p style="margin:0 0 16px; color:#666;">
      Browse the promoter marketplace, pick events you'd happily share, and earn a commission on every ticket sold through your link.
      Your earnings collect in your eventbuddy balance and you request payouts to your bank from your dashboard.
    </p>
    <p style="margin:0 0 14px; color:#666; font-size:13px;">First, verify your email to activate your account:</p>
    ${emailButton(verifyUrl, "Verify email", "#C21FAF")}
  `;
  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: "Welcome to eventbuddy, verify your email",
      text: `Welcome to eventbuddy, @${handle}! Verify your email to activate your promoter account: ${verifyUrl}`,
      html: renderEmailShell({ color: "#C21FAF", label: "Promoter account", emoji: "📣" }, bodyHtml),
    });
    return !error;
  } catch {
    return false;
  }
}

const Schema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name."),
  handle: z.string(),
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  phone: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const normalized = normalizePhone(v);
      if (!normalized) {
        ctx.addIssue({ code: "custom", message: "Enter a valid phone number." });
        return z.NEVER;
      }
      return normalized;
    }),
});

/** Promoter sign-up (migration 0105): an auth user plus a promoters row with
 *  their public handle. No organization is created. Same email-verification
 *  step as organizer sign-up before they can sign in. */
export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input." }, { status: 400 });
  const { fullName, email, password, phone } = parsed.data;
  const handleCheck = validateHandle(parsed.data.handle);
  if (!handleCheck.ok) return NextResponse.json({ error: handleCheck.error }, { status: 400 });
  const handle = handleCheck.handle;

  if (!(await checkRateLimit(`promoter-signup:ip:${clientIp(request)}`, 5, 60 * 60))) return rateLimitedResponse();

  const supabase = createAdminClient();
  const { data: taken } = await supabase.from("promoters").select("id").ilike("handle", handle).maybeSingle();
  if (taken) return NextResponse.json({ error: `@${handle} is taken. Try another handle.` }, { status: 409 });

  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: { redirectTo: new URL("/login?verified=1", request.url).toString(), data: { full_name: fullName, account_type: "promoter" } },
  });
  if (linkError || !linkData.user) {
    return NextResponse.json({ error: "Couldn't create that account. If you already have one, try signing in instead." }, { status: 400 });
  }
  const { error } = await supabase.from("promoters").insert({ user_id: linkData.user.id, handle, full_name: fullName, email, phone });
  if (error) {
    await supabase.auth.admin.deleteUser(linkData.user.id);
    const clash = error.code === "23505";
    return NextResponse.json({ error: clash ? `@${handle} is taken. Try another handle.` : "Couldn't create your promoter account." }, { status: clash ? 409 : 500 });
  }
  const emailSent = linkData.properties?.action_link ? await sendPromoterWelcome(email, fullName.split(/\s+/)[0], handle, linkData.properties.action_link) : false;
  return NextResponse.json({ success: true, handle, emailSent });
}
