import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

/** Best-effort verification email — the account and org already exist by the time this
 *  runs (unconfirmed), so a failure here (missing Resend key, provider error) is
 *  swallowed rather than surfaced as a failed signup; the account just stays
 *  unverified until they request another link. Mirrors sendRegistrationEmail's
 *  shape/tone in src/app/api/orgs/[slug]/register/route.ts. */
async function sendVerificationEmail(to: string, orgName: string, verifyUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: "Verify your email to activate eventbuddy",
      text: `Welcome to eventbuddy, ${orgName}!\n\nVerify your email to activate your organization account: ${verifyUrl}\n\nYou won't be able to sign in until it's verified.`,
      html: `
        <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 420px; margin: 0 auto; color: #1e1b2e;">
          <p style="text-transform:uppercase; letter-spacing:0.06em; font-size:11px; color:#1B512D; font-weight:600; margin:0 0 8px;">Verify your email</p>
          <h1 style="font-size:20px; margin:0 0 12px;">One step left, ${orgName}</h1>
          <p style="margin:0 0 20px; color:#666; font-size:14px; line-height:1.5;">
            Verify your email to activate your organization account. You won't be able to sign in until it's verified.
          </p>
          <a href="${verifyUrl}" style="display:inline-block; padding:11px 20px; border-radius:8px; background:#1B512D; color:#ffffff; font-size:14px; font-weight:600; text-decoration:none;">
            Verify email
          </a>
        </div>
      `,
    });
    return !error;
  } catch {
    return false;
  }
}

const SignupSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name."),
  orgName: z.string().trim().min(2, "Organization name must be at least 2 characters."),
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  phone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone number.")
    .max(20, "Enter a valid phone number.")
    .regex(/^[0-9+()\-\s]+$/, "Enter a valid phone number."),
});

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "org"
  );
}

/** Appends -2, -3, ... until it finds a slug that isn't already taken. */
async function uniqueSlug(supabase: ReturnType<typeof createAdminClient>, base: string) {
  const baseSlug = slugify(base);
  let candidate = baseSlug;
  let suffix = 2;
  for (;;) {
    const { data } = await supabase.from("organizations").select("id").ilike("slug", candidate).maybeSingle();
    if (!data) return candidate;
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = SignupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input." }, { status: 400 });
  }
  const { fullName, orgName, email, password, phone } = parsed.data;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY === "paste_your_supabase_service_role_key_here") {
    return NextResponse.json(
      { error: "Signup isn't configured yet. Add real Supabase keys to .env.local and restart the dev server." },
      { status: 500 }
    );
  }

  const supabase = createAdminClient();

  // generateLink with type "signup" both creates the (unconfirmed) auth user and
  // returns a confirmation link — the standard Supabase pattern for sending that
  // confirmation through your own mailer instead of Supabase's built-in one. No
  // separate admin.createUser call: doing both would just race to create the same
  // user twice.
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: { redirectTo: new URL("/login?verified=1", request.url).toString(), data: { full_name: fullName } },
  });
  if (linkError || !linkData.user) {
    return NextResponse.json({ error: linkError?.message || "Couldn't create that account." }, { status: 400 });
  }
  const created = linkData.user;

  const slug = await uniqueSlug(supabase, orgName);
  const { error: orgError } = await supabase.from("organizations").insert({ name: orgName, owner_user_id: created.id, slug, phone, email });
  if (orgError) {
    // Roll back the auth user so a failed org insert doesn't leave an orphaned account.
    await supabase.auth.admin.deleteUser(created.id);
    return NextResponse.json({ error: orgError.message || "Couldn't create your organization." }, { status: 500 });
  }

  const emailSent = linkData.properties?.action_link ? await sendVerificationEmail(email, orgName, linkData.properties.action_link) : false;

  return NextResponse.json({ success: true, slug, emailSent });
}
