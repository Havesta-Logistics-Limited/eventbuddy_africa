import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const SignupSchema = z.object({
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
  const { orgName, email, password, phone } = parsed.data;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY === "paste_your_supabase_service_role_key_here") {
    return NextResponse.json(
      { error: "Signup isn't configured yet. Add real Supabase keys to .env.local and restart the dev server." },
      { status: 500 }
    );
  }

  const supabase = createAdminClient();

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message || "Couldn't create that account." }, { status: 400 });
  }

  const slug = await uniqueSlug(supabase, orgName);
  const { error: orgError } = await supabase
    .from("organizations")
    .insert({ name: orgName, owner_user_id: created.user.id, slug, phone, email });
  if (orgError) {
    // Roll back the auth user so a failed org insert doesn't leave an orphaned account.
    await supabase.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: orgError.message || "Couldn't create your organization." }, { status: 500 });
  }

  return NextResponse.json({ success: true, slug });
}
