import { NextResponse } from "next/server";
import { resolveRouteUser } from "@/lib/supabase/route-auth";

/**
 * Bearer-token-friendly counterpart to getWalletSummary() in src/lib/store.ts (which the
 * web admin page calls directly against the browser Supabase client via RLS) — mobile has
 * no shared cookies with the web domain, so it needs this route instead. Same org
 * resolution as /api/paystack/subaccount (owner, then an active admin member); same
 * numbers, same "informational ledger, not a held balance" meaning — see that file's
 * comment for why there's nothing to withdraw here.
 */
export async function GET(request: Request) {
  const { user, supabase } = await resolveRouteUser(request);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let { data: org } = await supabase.from("organizations").select("id").eq("owner_user_id", user.id).maybeSingle();
  if (!org) {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .eq("status", "active")
      .maybeSingle();
    if (membership) {
      const { data: memberOrg } = await supabase.from("organizations").select("id").eq("id", membership.organization_id).maybeSingle();
      org = memberOrg;
    }
  }
  if (!org) return NextResponse.json({ error: "No organization found for this account." }, { status: 404 });

  const { data, error } = await supabase
    .from("paystack_transactions")
    .select("id, event_id, amount_naira, platform_fee_naira, net_amount_naira, created_at")
    .eq("organization_id", org.id)
    .eq("purpose", "ticket_purchase")
    .eq("status", "success")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const empty = { totalGrossNaira: 0, totalFeeNaira: 0, totalNetNaira: 0, salesCount: 0, events: [], recentTransactions: [] };
  if (!data || data.length === 0) return NextResponse.json(empty);

  const eventIds = Array.from(new Set(data.map((t) => t.event_id)));
  const { data: eventRows } = await supabase.from("events").select("id, name").in("id", eventIds);
  const eventNames = new Map((eventRows ?? []).map((e) => [e.id, e.name]));

  const byEvent = new Map<string, { grossNaira: number; feeNaira: number; netNaira: number; salesCount: number }>();
  let totalGrossNaira = 0;
  let totalFeeNaira = 0;
  let totalNetNaira = 0;
  for (const t of data) {
    const gross = Number(t.amount_naira);
    const fee = Number(t.platform_fee_naira ?? 0);
    const net = Number(t.net_amount_naira ?? gross - fee);
    totalGrossNaira += gross;
    totalFeeNaira += fee;
    totalNetNaira += net;
    const bucket = byEvent.get(t.event_id) ?? { grossNaira: 0, feeNaira: 0, netNaira: 0, salesCount: 0 };
    bucket.grossNaira += gross;
    bucket.feeNaira += fee;
    bucket.netNaira += net;
    bucket.salesCount += 1;
    byEvent.set(t.event_id, bucket);
  }

  return NextResponse.json({
    totalGrossNaira,
    totalFeeNaira,
    totalNetNaira,
    salesCount: data.length,
    events: Array.from(byEvent.entries())
      .map(([eventId, b]) => ({ eventId, eventName: eventNames.get(eventId) ?? "Deleted event", ...b }))
      .sort((a, b) => b.grossNaira - a.grossNaira),
    recentTransactions: data.slice(0, 20).map((t) => ({
      id: t.id,
      eventName: eventNames.get(t.event_id) ?? "Deleted event",
      amountNaira: Number(t.amount_naira),
      platformFeeNaira: Number(t.platform_fee_naira ?? 0),
      netAmountNaira: Number(t.net_amount_naira ?? Number(t.amount_naira) - Number(t.platform_fee_naira ?? 0)),
      createdAt: t.created_at,
    })),
  });
}
