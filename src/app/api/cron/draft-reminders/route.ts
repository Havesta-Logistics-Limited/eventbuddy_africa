import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailButton, escapeHtml, renderEmailShell } from "@/lib/email-template";
import { formatDate } from "@/lib/utils";

/** One reminder per still-unpublished event, sent to its org's admin — deliberately
 *  unconditional (no "already reminded this cycle" tracking) since the cron itself
 *  only fires every 2 hours, so each run is exactly one reminder per draft per
 *  cycle by construction. Stops the moment the event is published or deleted. */
async function sendDraftReminderEmail(to: string, firstName: string, eventName: string, eventDate: string, manageUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  const bodyHtml = `
    <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
    <h1 style="font-size:19px; margin:0 0 12px;">${escapeHtml(eventName)} is still a draft</h1>
    <p style="margin:0 0 20px; color:#666;">
      This event is saved but not published — it isn't visible to attendees and registration hasn't opened yet, even though it's scheduled for ${eventDate}.
    </p>
    <p style="margin:0 0 20px; color:#666;">Finish setting it up and publish it whenever you're ready to open registration.</p>
    ${emailButton(manageUrl, "Finish and publish", "#9a3412")}
  `;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: `Reminder: ${eventName} is still a draft`,
      text: `${eventName} is still saved as a draft and hasn't been published. Finish and publish it here: ${manageUrl}`,
      html: renderEmailShell({ color: "#9a3412", label: "Draft reminder", emoji: "⏰" }, bodyHtml),
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * netlify/functions/draft-reminders-cron.mts hits this every 2 hours to nudge org
 * admins about events they've saved as a draft but never published. Guarded by
 * CRON_SECRET so it can't be triggered by anyone who finds the URL.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: drafts, error } = await admin.from("events").select("id, name, date, organization_id").eq("published", false);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!drafts || drafts.length === 0) return NextResponse.json({ success: true, reminded: 0 });

  const orgIds = Array.from(new Set(drafts.map((e) => e.organization_id)));
  const { data: orgs, error: orgsError } = await admin.from("organizations").select("id, name, email, owner_user_id").in("id", orgIds);
  if (orgsError) return NextResponse.json({ error: orgsError.message }, { status: 500 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  let reminded = 0;

  for (const org of orgs || []) {
    if (!org.email) continue;
    let firstName = "there";
    const { data: userData } = await admin.auth.admin.getUserById(org.owner_user_id);
    const fullName = (userData?.user?.user_metadata?.full_name as string | undefined)?.trim();
    if (fullName) firstName = fullName.split(/\s+/)[0];

    const orgDrafts = drafts.filter((e) => e.organization_id === org.id);
    for (const event of orgDrafts) {
      const sent = await sendDraftReminderEmail(org.email, firstName, event.name, formatDate(event.date), `${siteUrl}/events/${event.id}`);
      if (sent) reminded++;
    }
  }

  return NextResponse.json({ success: true, reminded, drafts: drafts.length });
}
