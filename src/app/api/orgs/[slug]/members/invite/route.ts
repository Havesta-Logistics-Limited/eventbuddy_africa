import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveOrgAccess } from "@/lib/org-access";
import { emailButton, escapeHtml, renderEmailShell } from "@/lib/email-template";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { Resend } from "resend";

const BodySchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  role: z.enum(["admin", "event_support"]),
  eventId: z.string().uuid().optional(),
});

async function sendInviteEmail(to: string, orgName: string, role: "admin" | "event_support", inviteUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  const roleLabel = role === "admin" ? "an Admin" : "Event Support";
  const bodyHtml = `
    <p style="margin:0 0 16px;">You've been invited to join <strong>${escapeHtml(orgName)}</strong> on eventbuddy as ${roleLabel}.</p>
    <p style="margin:0 0 24px; color:#666;">Click below to set your password and get started.</p>
    ${emailButton(inviteUrl, "Accept invite", "#C21FAF")}
  `;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: `You've been invited to ${orgName} on eventbuddy`,
      text: `You've been invited to join ${orgName} on eventbuddy as ${roleLabel}. Accept your invite: ${inviteUrl}`,
      html: renderEmailShell({ color: "#C21FAF", label: "Team invite", emoji: "🤝" }, bodyHtml),
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Invites a teammate — admin (identical access to the owner) or event_support
 * (locked to one event). Only the owner or an existing admin member can invite
 * (resolveOrgAccess resolves both to role "admin"); event_support can never
 * reach this route successfully.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/members/invite">) {
  const { slug } = await ctx.params;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input." }, { status: 400 });
  }
  const { email, role, eventId } = parsed.data;
  if (role === "event_support" && !eventId) {
    return NextResponse.json({ error: "Pick the event this person will support." }, { status: 400 });
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!(await checkRateLimit(`member-invite:user:${user.id}`, 20, 60 * 60))) {
    return rateLimitedResponse();
  }

  const access = await resolveOrgAccess(supabase, user.id, slug);
  if (!access || access.role !== "admin") {
    return NextResponse.json({ error: "Not authorized to invite teammates for this organization." }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: org } = await admin.from("organizations").select("id, name").eq("id", access.id).maybeSingle();
  if (!org) return NextResponse.json({ error: "This organization couldn't be found." }, { status: 404 });

  if (role === "event_support") {
    const { data: event } = await admin.from("events").select("id").eq("id", eventId).eq("organization_id", org.id).maybeSingle();
    if (!event) return NextResponse.json({ error: "That event couldn't be found." }, { status: 404 });
  }

  const { data: existing } = await admin
    .from("organization_members")
    .select("id, status")
    .eq("organization_id", org.id)
    .ilike("email", email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: existing.status === "active" ? "That person is already on your team." : "There's already a pending invite for that email." },
      { status: 409 }
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: `${siteUrl}/accept-invite` },
  });
  if (linkError || !linkData.user) {
    return NextResponse.json({ error: linkError?.message || "Couldn't create that invite." }, { status: 400 });
  }

  const { error: insertError } = await admin.from("organization_members").insert({
    organization_id: org.id,
    user_id: linkData.user.id,
    email: email.toLowerCase(),
    role,
    event_id: role === "event_support" ? eventId : null,
    status: "pending",
  });
  if (insertError) {
    await admin.auth.admin.deleteUser(linkData.user.id);
    return NextResponse.json({ error: insertError.message || "Couldn't save that invite." }, { status: 500 });
  }

  const emailSent = linkData.properties?.action_link ? await sendInviteEmail(email, org.name, role, linkData.properties.action_link) : false;

  return NextResponse.json({ success: true, emailSent });
}
