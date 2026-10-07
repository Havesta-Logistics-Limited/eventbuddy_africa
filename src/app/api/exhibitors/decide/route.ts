import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveRouteUser } from "@/lib/supabase/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailApproved, emailConfirmedFree, emailDeclined, exhibitPayUrl, exhibitorPortalUrl } from "@/lib/exhibitors";

const Schema = z.object({
  exhibitorId: z.string().uuid(),
  action: z.enum(["approve", "decline", "cancel"]),
  reason: z.string().trim().max(500).optional(),
});

/** The organizer approves (holds the stand and emails a payment link),
 *  declines (with a reason), or cancels an unpaid approval. */
export async function POST(request: Request) {
  const { user, supabase } = await resolveRouteUser(request);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { exhibitorId, action, reason } = parsed.data;

  // ownership: RLS only lets the organizer read their own exhibitors
  const { data: mine } = await supabase.from("exhibitors").select("id").eq("id", exhibitorId).maybeSingle();
  if (!mine) return NextResponse.json({ error: "Application not found." }, { status: 404 });

  const admin = createAdminClient();
  const { data: x } = await admin
    .from("exhibitors")
    .select("id, status, email, company_name, contact_name, pay_token, portal_token, stand_type_id, event_id, events(name), stand_types(name, price_naira, quantity)")
    .eq("id", exhibitorId)
    .single();
  const eventName = (x?.events as unknown as { name: string } | null)?.name ?? "the event";
  const stand = x?.stand_types as unknown as { name: string; price_naira: number; quantity: number | null } | null;
  if (!x || !stand) return NextResponse.json({ error: "This application's stand type no longer exists." }, { status: 409 });
  const ctx = { company: x.company_name, contact: x.contact_name, eventName, standName: stand.name, price: Number(stand.price_naira) };
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;

  if (action === "approve") {
    if (x.status !== "applied") return NextResponse.json({ error: "Only new applications can be approved." }, { status: 409 });
    if (stand.quantity != null) {
      const { count } = await admin.from("exhibitors").select("id", { count: "exact", head: true }).eq("stand_type_id", x.stand_type_id).in("status", ["approved", "paid"]);
      if ((count ?? 0) >= stand.quantity) return NextResponse.json({ error: `No ${stand.name} left. Add more in Stand types, or decline.` }, { status: 409 });
    }
    const now = new Date().toISOString();
    // a free stand (0117) is confirmed on approval: no payment step
    const free = Number(stand.price_naira) === 0;
    const { error } = await admin
      .from("exhibitors")
      .update(free ? { status: "paid", amount_naira: 0, decided_at: now, paid_at: now } : { status: "approved", amount_naira: stand.price_naira, decided_at: now })
      .eq("id", x.id)
      .eq("status", "applied");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const emailed = free
      ? await emailConfirmedFree(x.email, { ...ctx, portalUrl: exhibitorPortalUrl(siteUrl, x.portal_token) })
      : await emailApproved(x.email, { ...ctx, payUrl: exhibitPayUrl(siteUrl, x.pay_token) });
    return NextResponse.json({ success: true, emailed, free });
  }

  if (action === "decline") {
    if (!["applied", "approved"].includes(x.status)) return NextResponse.json({ error: "This application can't be declined now." }, { status: 409 });
    const note = reason || "The stands for this event are fully allocated.";
    const { error } = await admin.from("exhibitors").update({ status: "declined", decline_reason: note, decided_at: new Date().toISOString() }).eq("id", x.id).in("status", ["applied", "approved"]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const emailed = await emailDeclined(x.email, { ...ctx, reason: note });
    return NextResponse.json({ success: true, emailed });
  }

  // cancel: release an approved stand that hasn't been paid for
  if (x.status !== "approved") return NextResponse.json({ error: "Only an unpaid approval can be cancelled." }, { status: 409 });
  const { error } = await admin.from("exhibitors").update({ status: "cancelled", decided_at: new Date().toISOString() }).eq("id", x.id).eq("status", "approved");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
