import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { nairaToChargeAmount, paystackInitialize } from "@/lib/paystack";
import { processingFeeFromSettings, processingFeeNaira } from "@/lib/billing";
import { newId } from "@/lib/utils";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";
import { standFeeMinor } from "@/lib/exhibitors";
import { checkSalesCap } from "@/lib/sales-guard";

const Token = z.string().uuid();

/** The card processing the exhibitor pays on top of the stand (migration 0130). */
async function standProcessingNaira(admin: ReturnType<typeof createAdminClient>, amountNaira: number) {
  const { data } = await admin
    .from("platform_settings")
    .select("buyer_pays_processing, processing_fee_percentage, processing_fee_flat_naira, processing_fee_flat_waived_below_naira, processing_fee_cap_naira")
    .eq("id", true)
    .maybeSingle();
  return processingFeeNaira(amountNaira, processingFeeFromSettings(data));
}

async function load(token: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("exhibitors")
    .select("id, status, email, company_name, contact_name, amount_naira, stand_label, organization_id, event_id, events(name, date, venue, location), stand_types(name), organizations(id, name, is_fee_exempt, is_suspended)")
    .eq("pay_token", token)
    .maybeSingle();
  return { admin, x: data };
}

/** The exhibitor's payment page reads its booking by the secret token. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!Token.safeParse(token).success) return NextResponse.json({ error: "This payment link isn't valid." }, { status: 404 });
  const { admin, x } = await load(token);
  if (!x) return NextResponse.json({ error: "This payment link isn't valid." }, { status: 404 });
  const amountNaira = Number(x.amount_naira ?? 0);
  // paid: what the payment actually carried; otherwise what paying now would add
  let processingNaira = 0;
  if (x.status === "paid") {
    const { data: t } = await admin.from("paystack_transactions").select("processing_fee_naira").eq("exhibitor_id", x.id).eq("status", "success").limit(1).maybeSingle();
    processingNaira = Number(t?.processing_fee_naira ?? 0);
  } else if (x.status === "approved") {
    processingNaira = await standProcessingNaira(admin, amountNaira);
  }
  const ev = x.events as unknown as { name: string; date: string; venue: string; location: string } | null;
  return NextResponse.json({
    status: x.status,
    company: x.company_name,
    contact: x.contact_name,
    amountNaira,
    processingNaira,
    standName: (x.stand_types as unknown as { name: string } | null)?.name ?? "Stand",
    standLabel: x.stand_label,
    organizer: (x.organizations as unknown as { name: string } | null)?.name ?? "",
    event: ev,
  });
}

/** Starts the Paystack payment for an approved stand (held funds, the
 *  organizer's ticket fee). */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = Token.safeParse(body?.token);
  if (!parsed.success) return NextResponse.json({ error: "This payment link isn't valid." }, { status: 404 });
  if (!(await checkRateLimit(`exhibit-pay:ip:${clientIp(request)}`, 20, 10 * 60))) return rateLimitedResponse();
  const { admin, x } = await load(parsed.data);
  if (!x) return NextResponse.json({ error: "This payment link isn't valid." }, { status: 404 });
  if (x.status === "paid") return NextResponse.json({ error: "This stand is already paid for." }, { status: 409 });
  if (x.status !== "approved") return NextResponse.json({ error: "This booking can't be paid for right now. Contact the organizer." }, { status: 409 });
  const org = x.organizations as unknown as { id: string; is_fee_exempt: boolean; is_suspended: boolean };
  if (org.is_suspended) return NextResponse.json({ error: "Payments for this event are unavailable right now." }, { status: 403 });

  // unverified organizers' sales limit (0111) covers stands too
  const cap = await checkSalesCap(admin, x.organization_id, x.event_id);
  if (!cap.allowed) return NextResponse.json({ error: "Payments for this event are paused while the organizer's account is being verified. Please try again soon." }, { status: 409 });

  const amountNaira = Number(x.amount_naira);
  // the exhibitor pays the card processing on top, so the stand price lands whole (0130)
  const processingNaira = await standProcessingNaira(admin, amountNaira);
  const { currency, amountMinor } = nairaToChargeAmount(amountNaira + processingNaira);
  const feeMinor = await standFeeMinor(admin, org, amountNaira);
  const reference = newId("standpay");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;

  const { error } = await admin.from("paystack_transactions").insert({
    organization_id: x.organization_id,
    event_id: x.event_id,
    exhibitor_id: x.id,
    reference,
    amount_naira: amountNaira,
    charge_currency: currency,
    charge_amount_minor: amountMinor,
    processing_fee_naira: processingNaira || null,
    purpose: "stand_booking",
    // stand money is always held: the organizer requests a payout like ticket money
    settlement: "held",
    platform_fee_naira: feeMinor / 100,
    net_amount_naira: Math.round((amountNaira - feeMinor / 100) * 100) / 100,
    registrant_data: { firstName: x.contact_name, lastName: "", email: x.email, company: x.company_name },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const { authorizationUrl } = await paystackInitialize({
      email: x.email,
      amountMinor,
      reference,
      callbackUrl: `${siteUrl}/exhibit/pay/${parsed.data}?reference=${encodeURIComponent(reference)}`,
      currency,
      metadata: { eventId: x.event_id, organizationId: x.organization_id, exhibitorId: x.id, purpose: "stand_booking" },
    });
    return NextResponse.json({ authorizationUrl });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't start payment." }, { status: 424 });
  }
}
