import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";
import { renderEmailShell, escapeHtml } from "@/lib/email-template";
import { unsubscribeUrl } from "@/lib/unsubscribe";

type Body = { email?: string; fullName?: string };

/** Best-effort, matching every other transactional email in this app — a failed
 *  send just means no notification, never a failed follow. This is the mitigation
 *  for /follow's own lack of ownership verification (see the route doc below):
 *  whoever's inbox actually receives this finds out immediately and can
 *  one-click unsubscribe, rather than only discovering it whenever the org's
 *  next blast happens to land. */
async function sendFollowNotificationEmail(to: string, orgName: string, unsubUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  const bodyHtml = `
    <p style="margin:0 0 16px;">Hi there,</p>
    <p style="margin:0 0 20px; color:#666;">You're now following <strong>${escapeHtml(orgName)}</strong> on eventbuddy — you'll hear from them about upcoming events and updates.</p>
    <p style="margin:0; color:#999; font-size:12px;">Didn't do this? <a href="${unsubUrl}" style="color:#999;">Unsubscribe instantly</a> — no account or login needed.</p>
  `;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: `You're now following ${orgName}`,
      text: `You're now following ${orgName} on eventbuddy.\n\nDidn't do this? Unsubscribe instantly: ${unsubUrl}`,
      html: renderEmailShell({ color: "#C21FAF", label: orgName, emoji: "👋" }, bodyHtml),
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Public, no-session — anyone can follow an org from its public page or a register
 * page's "Hosted By" card, the same trust model as self-service registration (the
 * service-role client is the actual boundary, not an auth check). Re-following after
 * a prior unsubscribe clears unsubscribed_at rather than erroring on the unique
 * constraint, so clicking Follow again always just works.
 *
 * Unlike registration, this needs no confirmation step to take effect — deliberately
 * consistent with the rest of the app's friction-free self-service model. The real
 * gap that leaves (anyone can add an email they don't own) is mitigated instead by
 * always emailing the address a confirmation with a one-click unsubscribe link, and
 * by rate-limiting per email too so one victim address can't be follow-bombed across
 * many orgs from many IPs.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/follow">) {
  const { slug } = await ctx.params;
  const body = (await request.json().catch(() => null)) as Body | null;
  const email = body?.email?.trim().toLowerCase();
  const fullName = body?.fullName?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const [ipOk, emailOk] = await Promise.all([
    checkRateLimit(`org-follow:ip:${clientIp(request)}`, 20, 10 * 60),
    checkRateLimit(`org-follow:email:${email}`, 10, 10 * 60),
  ]);
  if (!ipOk || !emailOk) return rateLimitedResponse();

  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("id, name, is_suspended").ilike("slug", slug).maybeSingle();
  if (!org) return NextResponse.json({ error: "No organization found for that link." }, { status: 404 });
  if (org.is_suspended) return NextResponse.json({ error: "This organizer isn't accepting followers right now." }, { status: 403 });

  const { error } = await admin
    .from("organization_followers")
    .upsert(
      { organization_id: org.id, email, full_name: fullName || null, unsubscribed_at: null },
      { onConflict: "organization_id,email" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  await sendFollowNotificationEmail(email, org.name, unsubscribeUrl(siteUrl, org.id, email));

  return NextResponse.json({ success: true });
}
