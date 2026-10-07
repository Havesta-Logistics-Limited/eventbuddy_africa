import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { normalizePhone } from "@/lib/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailButton, escapeHtml, renderEmailShell } from "@/lib/email-template";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";
import { RESERVED_SLUGS } from "@/lib/reserved-slugs";
import { GuestDraftSchema, slugifyEventName, type GuestDraft } from "@/lib/guest-draft";
import { uploadEventMediaAdmin } from "@/lib/supabase/storage";

/** Best-effort welcome email — the account and org already exist by the time this
 *  runs (unconfirmed), so a failure here (missing Resend key, provider error) is
 *  swallowed rather than surfaced as a failed signup; the account just stays
 *  unverified until they request another link. Doubles as the account's
 *  verification step (the "Verify your email" button at the end) since this is
 *  the one email every new signup is guaranteed to receive. */
async function sendWelcomeEmail(to: string, firstName: string, verifyUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  const bodyHtml = `
    <p style="margin:0 0 16px;">Dear ${escapeHtml(firstName)},</p>
    <p style="margin:0 0 16px;">Welcome to EventBuddy.</p>
    <p style="margin:0 0 16px;">I'm Noel Amobeda, the Founder of EventBuddy.</p>
    <p style="margin:0 0 16px;">We built EventBuddy because we believe <strong>event management shouldn't be chaotic — and event day shouldn't be full of surprises.</strong></p>
    <p style="margin:0 0 16px;">Too many organizers are still juggling registrations, payments, attendees, check-ins, staff, leads, and logistics across spreadsheets, forms, WhatsApp, and different tools.</p>
    <p style="margin:0 0 16px;">EventBuddy brings everything together in one place, helping you stay organized and know what's happening before, during, and after your event.</p>
    <p style="margin:0 0 16px;">But we also know that great event management is more than having the software.</p>
    <p style="margin:0 0 16px;"><strong>Sometimes, the best thing you can do as an organizer is step back and let an experienced team handle the execution.</strong></p>
    <p style="margin:0 0 16px;">That's why EventBuddy offers dedicated on-site event support. Our team can be there with you on event day to manage check-ins, attendee flow, registrations, lead capture, staff coordination, and other operational details — so you can focus on your guests, partners, speakers, and the bigger picture.</p>
    <p style="margin:0 0 16px;">Whether you're running an education fair, conference, job fair, corporate event, trade show, festival, or any other event, you can either use EventBuddy to manage it yourself or <strong>let our team help run it for you.</strong></p>
    <p style="margin:0 0 4px;">Our goal is simple:</p>
    <p style="margin:0 0 16px; font-weight:600;">Less chaos. Better events.</p>
    <p style="margin:0 0 24px;">You're now part of what we're building, and we look forward to helping you deliver your next great event.</p>
    <p style="margin:0 0 4px;">Warm regards,</p>
    <p style="margin:0 0 2px; font-weight:600;">Noel Amobeda</p>
    <p style="margin:0 0 28px; color:#666;">Founder, EventBuddy Africa</p>
    <div style="border-top:1px solid #eee; padding-top:24px;">
      <p style="margin:0 0 14px; color:#666; font-size:13px;">One last thing — verify your email to activate your account:</p>
      ${emailButton(verifyUrl, "Verify email", "#C21FAF")}
    </div>
  `;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: "Welcome to EventBuddy",
      text: `Welcome to EventBuddy, ${firstName}!\n\nVerify your email to activate your account: ${verifyUrl}`,
      html: renderEmailShell({ color: "#C21FAF", label: "Welcome", emoji: "👋" }, bodyHtml),
    });
    return !error;
  } catch {
    return false;
  }
}

const SignupSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name."),
  organizationName: z.string().trim().min(2, "Enter your organization's name."),
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  // Strict: real digit counts, Nigerian formats, stored canonically (+234…).
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
  // an event built on /create before signing up; saved as a draft
  draft: GuestDraftSchema.optional(),
});

/** Saves a visitor's /create draft as a draft event (never published) of
 *  their new organization, with its ticket types. Best effort: the account
 *  is what matters, so a failure here never fails the sign-up. */
async function saveDraftEvent(supabase: ReturnType<typeof createAdminClient>, orgId: string, draft: GuestDraft): Promise<string | null> {
  const e = draft.event;
  const base = slugifyEventName(e.name);
  let eventId: string | null = null;
  for (let attempt = 1; attempt <= 6 && !eventId; attempt++) {
    const { data, error } = await supabase
      .from("events")
      .insert({
        organization_id: orgId,
        name: e.name,
        slug: attempt === 1 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`,
        date: e.date,
        end_date: e.endDate || null,
        start_time: e.startTime || null,
        end_time: e.endTime || null,
        location: e.location,
        venue: e.venue,
        description: e.description,
        cover_image: e.coverImage || null,
        template_id: "custom",
        custom_fields: e.customFields,
        timezone: e.timezone || "Africa/Lagos",
        event_format: e.eventFormat,
        virtual_join_url: e.virtualJoinUrl || null,
        virtual_platform: e.virtualPlatform || null,
        virtual_access_notes: e.virtualAccessNotes || null,
        category: e.category || null,
        self_registration_enabled: e.selfRegistrationEnabled,
        is_invite_only: e.isInviteOnly,
        published: false,
      })
      .select("id")
      .single();
    if (data) eventId = data.id;
    else if (error?.code !== "23505") {
      console.error("[signup] couldn't save the draft event:", error?.message);
      return null;
    }
  }
  if (!eventId) return null;
  // the wizard hands covers over inline; keep them as files (inline if that fails)
  if (e.coverImage?.startsWith("data:")) {
    const url = await uploadEventMediaAdmin(supabase, `${orgId}/covers/${eventId}`, e.coverImage);
    if (url) await supabase.from("events").update({ cover_image: url }).eq("id", eventId);
  }
  if (draft.tickets.length) {
    const { error } = await supabase.from("ticket_types").insert(
      draft.tickets.map((t) => ({
        organization_id: orgId,
        event_id: eventId,
        name: t.name,
        price_naira: t.priceNaira,
        quantity_available: t.quantityAvailable,
        group_size: t.groupSize,
      }))
    );
    if (error) console.error("[signup] couldn't save the draft's tickets:", error.message);
  }
  return eventId;
}

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "org"
  );
}

/** Appends -2, -3, ... until it finds a slug that isn't already taken or reserved. */
async function uniqueSlug(supabase: ReturnType<typeof createAdminClient>, base: string) {
  const baseSlug = slugify(base);
  let candidate = baseSlug;
  let suffix = 2;
  for (;;) {
    if (!RESERVED_SLUGS.has(candidate)) {
      const { data } = await supabase.from("organizations").select("id").ilike("slug", candidate).maybeSingle();
      if (!data) return candidate;
    }
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
  const { fullName, organizationName, email, password, phone, draft } = parsed.data;
  const orgName = organizationName;

  // IP-only — a duplicate email already fails at the DB layer, so this exists to
  // stop one source from mass-creating fake accounts/orgs with different emails.
  if (!(await checkRateLimit(`signup:ip:${clientIp(request)}`, 5, 60 * 60))) {
    return rateLimitedResponse();
  }

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
    // Never pass linkError.message through — GoTrue's own wording for this call
    // discloses "a user with this email already exists", which lets an attacker
    // enumerate registered emails one signup attempt at a time. Zod above already
    // caught malformed input, so the only realistic failure left at this point is
    // a duplicate email (or an outage) — this generic message covers both without
    // confirming which.
    return NextResponse.json({ error: "Couldn't create that account. If you already have one, try logging in instead." }, { status: 400 });
  }
  const created = linkData.user;

  const slug = await uniqueSlug(supabase, orgName);
  const { data: org, error: orgError } = await supabase.from("organizations").insert({ name: orgName, owner_user_id: created.id, slug, phone, email }).select("id").single();
  if (orgError) {
    // Roll back the auth user so a failed org insert doesn't leave an orphaned account.
    await supabase.auth.admin.deleteUser(created.id);
    return NextResponse.json({ error: orgError.message || "Couldn't create your organization." }, { status: 500 });
  }

  const eventId = draft && org ? await saveDraftEvent(supabase, org.id, draft) : null;

  const firstName = fullName.trim().split(/\s+/)[0];
  const emailSent = linkData.properties?.action_link ? await sendWelcomeEmail(email, firstName, linkData.properties.action_link) : false;

  return NextResponse.json({ success: true, slug, emailSent, eventId });
}
