import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exhibitPayUrl, loadPortal } from "@/lib/exhibitors";

/** The exhibitor portal's data: booking, staff passes, lead count. */
export async function GET(request: Request) {
  const admin = createAdminClient();
  const x = await loadPortal(admin, new URL(request.url).searchParams.get("token"));
  if (!x) return NextResponse.json({ error: "This portal link isn't valid." }, { status: 404 });
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const base = {
    status: x.status,
    company: x.company_name,
    contact: x.contact_name,
    standName: x.standName,
    standLabel: x.stand_label,
    event: { name: x.event.name, date: x.event.date, startTime: x.event.start_time, venue: x.event.venue, location: x.event.location },
  };
  if (x.status !== "paid") {
    return NextResponse.json({ ...base, payUrl: x.status === "approved" ? exhibitPayUrl(siteUrl, x.pay_token) : null });
  }
  const [{ data: passes }, { count }] = await Promise.all([
    admin.from("registrations").select("reference_id, full_name, email, status, checked_in_at").eq("exhibitor_id", x.id).neq("status", "cancelled").order("created_at"),
    admin.from("exhibitor_leads").select("id", { count: "exact", head: true }).eq("exhibitor_id", x.id),
  ]);
  return NextResponse.json({
    ...base,
    passesIncluded: x.passesIncluded,
    passes: (passes ?? []).map((p) => ({ referenceId: p.reference_id, name: p.full_name, email: p.email, checkedIn: !!p.checked_in_at })),
    leadCount: count ?? 0,
  });
}
