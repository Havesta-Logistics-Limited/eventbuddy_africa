import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRegistrationGate, windowFromEvent } from "@/lib/capture-window";
import { applyDiscount } from "@/lib/billing";
import { nairaToChargeAmount, paystackInitialize } from "@/lib/paystack";
import { newId } from "@/lib/utils";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";

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
};

/**
 * Starts a Paystack checkout for a paid ticket — public, no session, same trust model
 * as /api/orgs/[slug]/register: the service-role client resolves and validates
 * everything server-side. No registration/lead row is created here — only once
 * payment succeeds, via finalizePaystackTransaction's 'ticket_purchase' branch,
 * exactly like a physical event stays unpublished until its own payment clears.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/ticket-purchase/initialize">) {
  const { slug } = await ctx.params;
  const body = (await request.json()) as Partial<InitializeBody>;
  const { eventId, ticketTypeId, firstName, lastName, email, phone, customAnswers, discountCode, source, hideFromGuestList } = body;
  const resolvedSource = source === "mobile" ? "mobile" : "web";

  if (!eventId || !ticketTypeId || !firstName?.trim() || !lastName?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  // Each call creates a paystack_transactions row and a real Paystack checkout
  // session even before the buyer pays — unlimited requests would spam both.
  if (!(await checkRateLimit(`ticket-purchase:ip:${clientIp(request)}`, 10, 10 * 60))) {
    return rateLimitedResponse();
  }

  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || apiKey === "paste_your_supabase_service_role_key_here") {
    return NextResponse.json({ error: "Not configured yet." }, { status: 500 });
  }

  const admin = createAdminClient();

  const { data: org } = await admin.from("organizations").select("id, is_suspended, paystack_subaccount_code").ilike("slug", slug).maybeSingle();
  if (!org) return NextResponse.json({ error: "No organization found for that link." }, { status: 404 });
  if (org.is_suspended) return NextResponse.json({ error: "Ticket sales are unavailable for this event right now." }, { status: 403 });
  if (!org.paystack_subaccount_code) {
    return NextResponse.json({ error: "This organizer hasn't set up ticket payouts yet — please check back later." }, { status: 400 });
  }

  const { data: event } = await admin
    .from("events")
    .select("id, date, end_date, start_time, end_time, timezone, capture_override, event_format, self_registration_enabled, published")
    .eq("id", eventId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });
  if (!event.published) return NextResponse.json({ error: "This event isn't live yet." }, { status: 403 });
  if (event.event_format !== "virtual" && event.self_registration_enabled === false) {
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

  const { data: ticket } = await admin
    .from("ticket_types")
    .select("id, price_naira, quantity_available, quantity_sold, sales_start, sales_end")
    .eq("id", ticketTypeId)
    .eq("event_id", event.id)
    .maybeSingle();
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

  const listedPriceNaira = Number(ticket.price_naira);
  if (!(listedPriceNaira > 0)) {
    return NextResponse.json({ error: "This is a free ticket — use registration directly." }, { status: 400 });
  }

  // Discount codes are re-validated fresh here via the exact same function the
  // checkout preview calls (public_validate_discount_code) — never trust a
  // discounted amount the client computed, and never re-derive the validation
  // rules in TypeScript where they could drift from what the preview showed.
  let discountCodeId: string | null = null;
  let amountNaira = listedPriceNaira;
  if (discountCode?.trim()) {
    const { data: validation, error: validationErr } = await admin
      .rpc("public_validate_discount_code", { p_event_id: event.id, p_code: discountCode.trim(), p_ticket_type_id: ticket.id, p_email: email.trim() })
      .maybeSingle<{
        valid: boolean;
        error_message: string | null;
        discount_code_id: string | null;
        discount_type: "percentage" | "fixed" | null;
        discount_value: number | null;
        max_discount_naira: number | null;
      }>();
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

  const reference = newId("tixpay");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const callbackUrl = `${siteUrl}/${slug}/events/${eventId}/register?payment=callback&reference=${encodeURIComponent(reference)}`;

  const { currency, amountMinor } = nairaToChargeAmount(amountNaira);

  const { error: insertError } = await admin.from("paystack_transactions").insert({
    organization_id: org.id,
    event_id: event.id,
    reference,
    amount_naira: amountNaira,
    charge_currency: currency,
    charge_amount_minor: amountMinor,
    purpose: "ticket_purchase",
    ticket_type_id: ticket.id,
    discount_code_id: discountCodeId,
    subaccount_code: org.paystack_subaccount_code,
    registrant_data: {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone?.trim() || null,
      customAnswers: customAnswers || {},
      source: resolvedSource,
      hideFromGuestList: Boolean(hideFromGuestList),
    },
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  try {
    const { authorizationUrl } = await paystackInitialize({
      email: email.trim(),
      amountMinor,
      reference,
      callbackUrl,
      currency,
      subaccount: org.paystack_subaccount_code,
      metadata: { eventId: event.id, organizationId: org.id, ticketTypeId: ticket.id, discountCodeId },
    });
    return NextResponse.json({ authorizationUrl });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't start payment." }, { status: 502 });
  }
}
