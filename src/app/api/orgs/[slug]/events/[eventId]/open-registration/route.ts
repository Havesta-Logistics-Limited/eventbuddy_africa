import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveOrgAccess } from "@/lib/org-access";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { emailButton, escapeHtml, renderEmailShell } from "@/lib/email-template";

/**
 * The organizer opens (or pauses) registration and ticket sales (migration
 * 0128). Opening emails everyone who asked to be told, once each.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/open-registration">) {
  const { slug, eventId } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { open?: boolean } | null;
  const open = body?.open !== false;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const access = await resolveOrgAccess(supabase, user.id, slug);
  if (!access || (access.role === "event_support" && access.eventId !== eventId)) {
    return NextResponse.json({ error: "Not authorized for this event." }, { status: 403 });
  }
  if (!(await checkRateLimit(`open-registration:user:${user.id}`, 30, 10 * 60))) return rateLimitedResponse();

  const admin = createAdminClient();
  const { data: event } = await admin.from("events").select("id, name, slug, published, visibility, private_code").eq("id", eventId).eq("organization_id", access.id).maybeSingle();
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });
  const { error } = await admin.from("events").update({ registration_open: open }).eq("id", event.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!open) return NextResponse.json({ success: true, notified: 0 });

  // tell everyone who asked, once
  const { data: waiting } = await admin.from("event_open_notify").select("id, email").eq("event_id", event.id).is("notified_at", null).limit(2000);
  let notified = 0;
  const apiKey = process.env.RESEND_API_KEY;
  if (event.published && waiting?.length && apiKey && apiKey !== "paste_your_resend_api_key_here") {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const url =
      event.visibility === "private" && event.private_code
        ? `${siteUrl}/p/${event.private_code}`
        : event.slug
          ? `${siteUrl}/${event.slug}`
          : `${siteUrl}/${access.slug}/events/${event.id}/register`;
    const resend = new Resend(apiKey);
    for (const w of waiting) {
      const { error: mailError } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
        to: w.email,
        subject: `Registration is open: ${event.name}`,
        text: `Registration and tickets for ${event.name} are now open: ${url}`,
        html: renderEmailShell(
          { color: "#C21FAF", label: "Registration open", emoji: "🎟️" },
          `<p style="margin:0 0 14px;">You asked us to tell you: registration and tickets for <strong>${escapeHtml(event.name)}</strong> are now open.</p>
           <div style="margin:22px 0;">${emailButton(url, "Get your ticket", "#C21FAF")}</div>
           <p style="margin:0; font-size:12px; color:#94a3b8;">You're getting this once because you asked to be notified on the event page.</p>`
        ),
      });
      if (!mailError) {
        notified++;
        await admin.from("event_open_notify").update({ notified_at: new Date().toISOString() }).eq("id", w.id);
      }
    }
  }
  return NextResponse.json({ success: true, notified });
}
