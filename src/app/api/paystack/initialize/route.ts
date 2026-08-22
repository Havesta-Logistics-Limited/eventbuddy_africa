import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { convertUsdToChargeAmount, paystackInitialize } from "@/lib/paystack";
import { newId } from "@/lib/utils";

type InitializeBody = { eventId: string };

/**
 * Starts a Paystack checkout for a physical event the caller just created (unpublished,
 * awaiting payment). Auth is a real signed-in Supabase Auth session — the event lookup
 * below goes through the RLS-scoped server client, the same events_all_own_org policy
 * every other org-admin action is gated by, so this can only ever be called for an
 * event the caller's own organization actually owns.
 */
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = (await request.json()) as Partial<InitializeBody>;
  const { eventId } = body;
  if (!eventId) {
    return NextResponse.json({ error: "Missing event id." }, { status: 400 });
  }

  const { data: event } = await supabase
    .from("events")
    .select("id, organization_id, event_format, published, payment_status, price_usd")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }
  if (event.event_format === "virtual") {
    return NextResponse.json({ error: "Virtual events are free — no payment needed." }, { status: 400 });
  }
  if (event.published || event.payment_status === "paid") {
    return NextResponse.json({ error: "This event has already been paid for." }, { status: 400 });
  }

  const amountUsd = Number(event.price_usd);
  if (!(amountUsd > 0)) {
    return NextResponse.json({ error: "This event has no price set. Please contact support." }, { status: 500 });
  }

  const reference = newId("evtpay");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const callbackUrl = `${siteUrl}/events/${eventId}?payment=callback&reference=${encodeURIComponent(reference)}`;

  let currency: string;
  let amountMinor: number;
  try {
    ({ currency, amountMinor } = convertUsdToChargeAmount(amountUsd));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Payments aren't configured yet." }, { status: 500 });
  }

  // paystack_transactions has no insert policy for an org's own RLS-scoped client —
  // only the payment routes (this one) write here, via the service-role client.
  const admin = createAdminClient();
  const { error: insertError } = await admin.from("paystack_transactions").insert({
    organization_id: event.organization_id,
    event_id: event.id,
    reference,
    amount_usd: amountUsd,
    charge_currency: currency,
    charge_amount_minor: amountMinor,
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  try {
    const { authorizationUrl } = await paystackInitialize({
      email: user.email,
      amountMinor,
      reference,
      callbackUrl,
      currency,
      metadata: { eventId: event.id, organizationId: event.organization_id },
    });
    return NextResponse.json({ authorizationUrl });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't start payment." }, { status: 502 });
  }
}
