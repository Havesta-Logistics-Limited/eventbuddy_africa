import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailLeadsExpiring, exhibitorPortalUrl } from "@/lib/exhibitors";

/**
 * netlify/functions/data-retention-cron.mts hits this nightly (migration
 * 0115). First emails exhibitors whose leads are 7 days from deletion, then
 * removes what the Privacy Policy says we don't keep: exhibitor leads 90 days
 * after the event (closing that exhibitor's portal), staff passes after 30,
 * and payment attempts that never went through after 90. Payments, payouts,
 * refunds and the ledger are never touched. Guarded by CRON_SECRET.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;

  let reminded = 0;
  const { data: due, error: dueError } = await admin.rpc("retention_exhibitor_reminders");
  if (dueError) return NextResponse.json({ error: dueError.message }, { status: 500 });
  for (const x of (due ?? []) as { exhibitor_id: string; email: string; company_name: string; contact_name: string; event_name: string; delete_on: string; portal_token: string; lead_count: number }[]) {
    const sent = await emailLeadsExpiring(x.email, {
      company: x.company_name,
      contact: x.contact_name,
      eventName: x.event_name,
      leadCount: Number(x.lead_count),
      deleteOn: x.delete_on,
      portalUrl: exhibitorPortalUrl(siteUrl, x.portal_token),
    });
    // marked either way: one attempt, so a mail outage doesn't spam later
    await admin.from("exhibitors").update({ retention_reminded_at: new Date().toISOString() }).eq("id", x.exhibitor_id);
    if (sent) reminded++;
  }

  const { data: removed, error } = await admin.rpc("run_data_retention");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, reminded, removed });
}
