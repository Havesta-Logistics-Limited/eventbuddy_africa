import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { nairaToChargeAmount, paystackInitialize } from "@/lib/paystack";
import { newId } from "@/lib/utils";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";
import { standFeeMinor } from "@/lib/exhibitors";

const Token = z.string().uuid();

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
  const { x } = await load(token);
  if (!x) return NextResponse.json({ error: "This payment link isn't valid." }, { status: 404 });
  const ev = x.events as unknown as { name: string; date: string; venue: string; location: string } | null;
  return NextResponse.json({
    status: x.status,
    company: x.company_name,
    contact: x.contact_name,
    amountNaira: Number(x.amount_naira ?? 0),
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

  const amountNaira = Number(x.amount_naira);
  const { currency, amountMinor } = nairaToChargeAmount(amountNaira);
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
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't start payment." }, { status: 502 });
  }
}
