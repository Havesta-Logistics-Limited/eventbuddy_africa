import { NextResponse } from "next/server";
import { cleanAttribution } from "@/lib/marketing-attribution";
import { optionalPhone } from "@/lib/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRegistrationGate, windowFromEvent } from "@/lib/capture-window";
import { applyDiscount, processingFeeFromSettings, processingFeeNaira, ticketFeeMinor } from "@/lib/billing";
import { organizerTicketFee } from "@/lib/org-fee";
import { nairaToChargeAmount, paystackInitialize } from "@/lib/paystack";
import { newId } from "@/lib/utils";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";
import { resolveReferralId } from "@/lib/referrals";
import { checkSalesCap } from "@/lib/sales-guard";
import { validateGroupGuests } from "@/lib/group-tickets";

type InitializeBody = {
  eventId: string;
  ticketTypeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  customAnswers?: Record<string, string | string[]>;
  discountCode?: string;
  /** See /api/orgs/[slug]/register's identical field — carried through
   *  registrant_data so createTicketPurchaseRegistration can tag the eventual
   *  registrations/leads row once payment succeeds. */
  source?: "web" | "mobile";
  hideFromGuestList?: boolean;
  /** Referral code from the ?ref= on the share link. Recorded on the
   *  transaction now and copied onto the registration when the payment
   *  finalizes, so an abandoned checkout stays attributable too. */
  ref?: string;
  /** the link and source that brought them (marketing report, migration 0132) */
  attribution?: unknown;
  /** Kiosk walk-up sale: the door staff member taking the payment. The sale is
   *  checked in the moment it's paid. Same trust model as /api/checkin: the
   *  staff id is the door's session, checked against this event below. */
  kioskStaffId?: string;
  /** Group (bundle) tickets only: the other people this purchase admits, named
   *  by the buyer. Each becomes their own registration with its own QR. */
  guests?: unknown;
};

/**
 * Starts a Paystack checkout for a paid ticket — public, no session, same trust model
 * as /api/orgs/[slug]/register: the service-role client resolves and validates
 * everything server-side. No registration/lead row is created here — only once
 * payment succeeds, via finalizePaystackTransaction's 'ticket_purchase' branch,
 * exactly like a physical event stays unpublished until its own payment clears.
 */
/** How long an unpaid checkout keeps its seat and code use. Paystack's own
 *  checkout page times out well within this. */
const CHECKOUT_HOLD_MINUTES = 30;

async function openCheckoutHolds(
  admin: ReturnType<typeof createAdminClient>,
  p: { ticketTypeId: string; discountCodeId: string | null; email: string }
): Promise<{ seats: number; codeUses: number }> {
  const since = new Date(Date.now() - CHECKOUT_HOLD_MINUTES * 60_000).toISOString();
  // other buyers' checkouts only: someone retrying after closing Paystack's
  // page mustn't be blocked by their own abandoned attempt
  const open = () =>
    admin
      .from("paystack_transactions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .gte("created_at", since)
      .not("registrant_data->>email", "ilike", p.email);
  const [seats, codeUses] = await Promise.all([
    open().eq("ticket_type_id", p.ticketTypeId),
    p.discountCodeId ? open().eq("discount_code_id", p.discountCodeId) : Promise.resolve({ count: 0 }),
  ]);
  return { seats: seats.count ?? 0, codeUses: codeUses.count ?? 0 };
}

export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/ticket-purchase/initialize">) {
  const { slug } = await ctx.params;
  const body = (await request.json()) as Partial<InitializeBody>;
  const { eventId, ticketTypeId, firstName, lastName, email, phone, customAnswers, discountCode, source, hideFromGuestList, ref, guests } = body;
  const resolvedSource: "web" | "mobile" | "kiosk" = source === "mobile" ? "mobile" : "web";

  if (!eventId || !ticketTypeId || !firstName?.trim() || !lastName?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }
  const phoneCheck = optionalPhone(phone);
  if (!phoneCheck.ok) return NextResponse.json({ error: phoneCheck.error }, { status: 400 });

  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || apiKey === "paste_your_supabase_service_role_key_here") {
    return NextResponse.json({ error: "Not configured yet." }, { status: 500 });
  }
  const admin = createAdminClient();

  // Everything this checkout needs is looked up at once rather than one after
  // another: each lookup is a round trip to the database, and in sequence
  // they kept the buyer waiting seconds before Paystack opened. The checks
  // below still run in the same order with the same messages.
  //
  // Each call creates a paystack_transactions row and a real Paystack checkout
  // session even before the buyer pays — unlimited requests would spam both.
  // Same venue-NAT problem as /register, and worse here: 10/10min meant the
  // 11th person buying at the door was refused. Per-person control is the
  // email — which is also the right key against card testing, since that
  // burns many attempts per identity — with IP left as a flood ceiling.
  const [emailOk, ipOk, { data: org }, { data: settings }, { data: eventRow }, { data: ticket }, { data: staffRow }] = await Promise.all([
    checkRateLimit(`ticket-purchase:email:${email.trim().toLowerCase()}`, 10, 10 * 60),
    checkRateLimit(`ticket-purchase:ip:${clientIp(request)}`, 300, 10 * 60),
    admin.from("organizations").select("id, is_suspended, is_fee_exempt, paystack_subaccount_code, payout_account_number").ilike("slug", slug).maybeSingle(),
    // eventbuddy's fee for this one ticket (percentage of the price paid + flat
    // amount, migration 0098), read live so a rate change applies to the very
    // next sale; held funds (0102); the buyer's processing fee (0130)
    admin
      .from("platform_settings")
      .select(
        "ticket_fee_percentage, ticket_fee_flat_naira, held_funds_enabled, buyer_pays_processing, processing_fee_percentage, processing_fee_flat_naira, processing_fee_flat_waived_below_naira, processing_fee_cap_naira"
      )
      .eq("id", true)
      .maybeSingle(),
    admin
      .from("events")
      .select("id, organization_id, date, end_date, start_time, end_time, timezone, capture_override, event_format, self_registration_enabled, published, registration_open")
      .eq("id", eventId)
      .maybeSingle(),
    admin
      .from("ticket_types")
      .select("id, price_naira, quantity_available, quantity_sold, sales_start, sales_end, group_size")
      .eq("id", ticketTypeId)
      .eq("event_id", eventId)
      .maybeSingle(),
    body.kioskStaffId ? admin.from("staff").select("id, event_id, role").eq("id", body.kioskStaffId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!emailOk || !ipOk) return rateLimitedResponse();

  if (!org) return NextResponse.json({ error: "No organization found for that link." }, { status: 404 });
  if (org.is_suspended) return NextResponse.json({ error: "Ticket sales are unavailable for this event right now." }, { status: 403 });
  // Held funds: sales need a verified payout bank account on record (where
  // eventbuddy sends approved payouts). Legacy split mode needs the subaccount.
  const held = Boolean(settings?.held_funds_enabled);
  const payoutReady = held ? Boolean(org.payout_account_number) : Boolean(org.paystack_subaccount_code);
  if (!payoutReady) {
    return NextResponse.json({ error: "This organizer hasn't added their payout bank account yet — please check back later." }, { status: 400 });
  }

  const event = eventRow && eventRow.organization_id === org.id ? eventRow : null;
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });
  if (!event.published) return NextResponse.json({ error: "This event isn't live yet." }, { status: 403 });
  // a kiosk sale: the staff member must be door staff for this very event
  let kioskStaffId: string | null = null;
  if (body.kioskStaffId) {
    if (!staffRow || staffRow.event_id !== event.id || staffRow.role !== "staff") {
      return NextResponse.json({ error: "Your door session has expired — please sign in again." }, { status: 401 });
    }
    kioskStaffId = staffRow.id;
  }

  // door staff can sell before online registration opens, or on a door-only event
  if (!kioskStaffId && event.registration_open === false) {
    return NextResponse.json({ error: "Registration hasn't opened yet. Leave your email on the event page and we'll tell you when it opens." }, { status: 403 });
  }
  if (!kioskStaffId && event.event_format !== "virtual" && event.self_registration_enabled === false) {
    return NextResponse.json({ error: "Registration isn't available for this event." }, { status: 403 });
  }

  const gate = getRegistrationGate(
    windowFromEvent({ date: event.date, endDate: event.end_date ?? undefined, startTime: event.start_time ?? undefined, endTime: event.end_time ?? undefined }),
    event.timezone ?? undefined,
    event.capture_override ?? undefined
  );
  if (!gate.open) {
    const message =
      gate.reason === "manually_closed" ? "Registration has been closed by the event organizer." : `Registration has closed — it ended ${gate.closesAt.toLocaleString()}.`;
    return NextResponse.json({ error: message }, { status: 403 });
  }

  if (!ticket) return NextResponse.json({ error: "This ticket type couldn't be found." }, { status: 404 });

  const now = new Date();
  if (ticket.sales_start && new Date(ticket.sales_start) > now) {
    return NextResponse.json({ error: "Ticket sales haven't opened yet." }, { status: 403 });
  }
  if (ticket.sales_end && new Date(ticket.sales_end) < now) {
    return NextResponse.json({ error: "Ticket sales have closed." }, { status: 403 });
  }
  if (ticket.quantity_available != null && ticket.quantity_sold >= ticket.quantity_available) {
    return NextResponse.json({ error: "This ticket type is sold out." }, { status: 409 });
  }

  // Group tickets: every extra seat must be a named guest, and only in-person
  // events (each guest checks in at the door with their own QR).
  const groupSize = Math.max(1, Number(ticket.group_size ?? 1));
  if (groupSize > 1 && event.event_format === "virtual") {
    return NextResponse.json({ error: "Group tickets aren't available for virtual events." }, { status: 400 });
  }
  const guestCheck = validateGroupGuests(groupSize, guests, email);
  if (!guestCheck.ok) return NextResponse.json({ error: guestCheck.error }, { status: 400 });

  const listedPriceNaira = Number(ticket.price_naira);
  if (!(listedPriceNaira > 0)) {
    return NextResponse.json({ error: "This is a free ticket — use registration directly." }, { status: 400 });
  }

  // Second round, also at once: the unverified organizer's sales cap (0111),
  // the discount code, the organizer's fee rate and the promoter link.
  //
  // Discount codes are re-validated fresh here via the exact same function the
  // checkout preview calls (public_validate_discount_code) — never trust a
  // discounted amount the client computed, and never re-derive the validation
  // rules in TypeScript where they could drift from what the preview showed.
  // The organizer's rate: fee-exempt, a custom agreed rate (migration 0126),
  // their plan's rate (0104), or the platform default; see organizerTicketFee.
  const [cap, discountRes, { fee: organizerFee }, referralId] = await Promise.all([
    checkSalesCap(admin, org.id, event.id),
    discountCode?.trim()
      ? admin
          .rpc("public_validate_discount_code", { p_event_id: event.id, p_code: discountCode.trim(), p_ticket_type_id: ticket.id, p_email: email.trim() })
          .maybeSingle<{
            valid: boolean;
            error_message: string | null;
            discount_code_id: string | null;
            discount_type: "percentage" | "fixed" | null;
            discount_value: number | null;
            max_discount_naira: number | null;
          }>()
      : Promise.resolve(null),
    organizerTicketFee(admin, org.id),
    resolveReferralId(admin, event.id, ref),
  ]);
  if (!cap.allowed) return NextResponse.json({ error: cap.message }, { status: 409 });

  let discountCodeId: string | null = null;
  let amountNaira = listedPriceNaira;
  if (discountRes) {
    const { data: validation, error: validationErr } = discountRes;
    if (validationErr) return NextResponse.json({ error: validationErr.message }, { status: 500 });
    if (!validation?.valid || !validation.discount_type || validation.discount_value == null) {
      return NextResponse.json({ error: validation?.error_message || "This discount code isn't valid for this event." }, { status: 404 });
    }
    amountNaira = applyDiscount(listedPriceNaira, validation.discount_type, Number(validation.discount_value), validation.max_discount_naira);
    if (!(amountNaira > 0)) {
      return NextResponse.json({ error: "This code fully covers the ticket price — contact the organizer to register." }, { status: 400 });
    }
    discountCodeId = validation.discount_code_id;
  }

  // Seats and code uses only count once a payment succeeds, so on their own
  // the checks above let 30 people open checkouts for the last 5 seats, or a
  // "first 20" code be paid for 50 times. Checkouts still open count too.
  const holds = await openCheckoutHolds(admin, { ticketTypeId: ticket.id, discountCodeId, email: email.trim() });
  if (ticket.quantity_available != null && ticket.quantity_sold + holds.seats >= ticket.quantity_available) {
    return NextResponse.json({ error: "The last tickets are in other people's checkouts right now. Try again in a few minutes." }, { status: 409 });
  }
  if (discountCodeId) {
    const { data: code } = await admin.from("discount_codes").select("max_uses, uses_count").eq("id", discountCodeId).maybeSingle();
    if (code?.max_uses != null && code.uses_count + holds.codeUses >= code.max_uses) {
      return NextResponse.json({ error: "This code's remaining uses are in other people's checkouts right now. Try again in a few minutes." }, { status: 409 });
    }
  }

  const reference = newId("tixpay");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const callbackUrl = `${siteUrl}/${slug}/events/${eventId}/register?payment=callback&reference=${encodeURIComponent(reference)}`;

  // The buyer pays the card processing on top (migration 0130), so the ticket
  // price lands whole after Paystack's cut; amount_naira stays the ticket price.
  const processingNaira = processingFeeNaira(amountNaira, processingFeeFromSettings(settings));
  const { currency, amountMinor } = nairaToChargeAmount(amountNaira + processingNaira);
  const platformFeeMinor = org.is_fee_exempt ? 0 : ticketFeeMinor(amountNaira, organizerFee, groupSize);
  // Held funds (migration 0102): no subaccount split; the whole payment lands in
  // eventbuddy's balance and finalize credits the organizer's ledger with the
  // sale minus this fee, recorded here because Paystack won't report a split.

  const attribution = cleanAttribution(body.attribution);

  const { error: insertError } = await admin.from("paystack_transactions").insert({
    referral_id: referralId,
    attribution,
    organization_id: org.id,
    event_id: event.id,
    reference,
    amount_naira: amountNaira,
    charge_currency: currency,
    charge_amount_minor: amountMinor,
    processing_fee_naira: processingNaira || null,
    purpose: "ticket_purchase",
    ticket_type_id: ticket.id,
    discount_code_id: discountCodeId,
    subaccount_code: held ? null : org.paystack_subaccount_code,
    settlement: held ? "held" : "split",
    ...(held ? { platform_fee_naira: platformFeeMinor / 100, net_amount_naira: Math.round((amountNaira - platformFeeMinor / 100) * 100) / 100 } : {}),
    registrant_data: {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phoneCheck.value,
      customAnswers: customAnswers || {},
      source: kioskStaffId ? "kiosk" : resolvedSource,
      ...(kioskStaffId ? { kioskStaffId } : {}),
      hideFromGuestList: Boolean(hideFromGuestList),
      guests: guestCheck.guests,
    },
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  try {
    const { authorizationUrl, accessCode } = await paystackInitialize({
      email: email.trim(),
      amountMinor,
      reference,
      callbackUrl,
      currency,
      subaccount: held ? undefined : org.paystack_subaccount_code,
      // legacy split: eventbuddy's account pays Paystack's charge, so it keeps the processing fee too
      transactionChargeMinor: held ? undefined : platformFeeMinor + processingNaira * 100,
      metadata: { eventId: event.id, organizationId: org.id, ticketTypeId: ticket.id, discountCodeId },
    });
    // the kiosk opens Paystack's payment window on the door device with the access code
    return NextResponse.json({ authorizationUrl, ...(kioskStaffId ? { accessCode, reference } : {}) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't start payment." }, { status: 424 });
  }
}
