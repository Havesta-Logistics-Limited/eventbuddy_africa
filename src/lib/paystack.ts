import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { generateReferenceId } from "@/lib/utils";
import { sendRegistrationEmail, sendVirtualConfirmationEmail } from "@/lib/registration-email";
import { ensureHubMember, hubUrl as buildHubUrl } from "@/lib/event-hub";
import { emailButton, escapeHtml, renderEmailShell } from "@/lib/email-template";
import { formatNaira } from "@/lib/billing";

/**
 * Server-only — imports nothing that can't run in a Route Handler. Never import this
 * from a "use client" file; PAYSTACK_SECRET_KEY must never reach the browser.
 */

const PAYSTACK_BASE = "https://api.paystack.co";

function paystackKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key || key === "paste_your_paystack_secret_key_here") {
    throw new Error("Payments aren't configured yet. Add a real PAYSTACK_SECRET_KEY to .env.local.");
  }
  return key;
}

/**
 * eventbuddy's pricing (the pricing page, the platform Billing tab, JSON-LD, every
 * price shown anywhere) is denominated in Naira, matching the only currency this
 * Paystack account accepts — confirmed directly against the Paystack API (a USD
 * initialize call returns "unsupported_currency"). No conversion or exchange rate is
 * needed: the amount actually charged is exactly the listed Naira price, in kobo.
 */
export function nairaToChargeAmount(amountNaira: number): { currency: string; amountMinor: number } {
  return { currency: "NGN", amountMinor: Math.round(amountNaira * 100) };
}

type PaystackInitializeResponse = {
  status: boolean;
  message: string;
  data?: { authorization_url: string; access_code: string; reference: string };
};

export async function paystackInitialize(params: {
  email: string;
  /** Smallest unit of `currency` — kobo for NGN, cents for USD, etc. */
  amountMinor: number;
  reference: string;
  callbackUrl: string;
  currency: string;
  metadata: Record<string, unknown>;
  /** A Paystack subaccount code — every real caller sets this: the subaccount's
   *  registered bank account gets the sale minus its own percentage_charge
   *  (eventbuddy's cut), settled automatically by Paystack. Optional only because
   *  that's the shape of a split payment in general, not because any current
   *  caller omits it. */
  subaccount?: string;
}): Promise<{ authorizationUrl: string; accessCode: string }> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${paystackKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: params.email,
      amount: params.amountMinor,
      reference: params.reference,
      callback_url: params.callbackUrl,
      currency: params.currency,
      metadata: params.metadata,
      ...(params.subaccount ? { subaccount: params.subaccount } : {}),
    }),
  });
  const json = (await res.json()) as PaystackInitializeResponse;
  if (!res.ok || !json.status || !json.data) {
    throw new Error(json.message || "Couldn't start payment. Please try again.");
  }
  return { authorizationUrl: json.data.authorization_url, accessCode: json.data.access_code };
}

type PaystackBankRow = { name: string; code: string; slug: string };

/** For a bank-selection dropdown in payout onboarding — Nigerian banks only, matching
 *  this account's currency (see nairaToChargeAmount's NGN-only note above). */
export async function listPaystackBanks(): Promise<{ name: string; code: string }[]> {
  const res = await fetch(`${PAYSTACK_BASE}/bank?country=nigeria&currency=NGN`, {
    headers: { Authorization: `Bearer ${paystackKey()}` },
  });
  const json = (await res.json()) as { status: boolean; message: string; data?: PaystackBankRow[] };
  if (!res.ok || !json.status || !json.data) {
    throw new Error(json.message || "Couldn't load the list of banks.");
  }
  // Paystack's own list has a handful of genuine duplicate settlement codes (merged/
  // rebranded institutions) — a <select> can't meaningfully offer two options for the
  // same value, so keep only the first name seen per code.
  const seen = new Set<string>();
  const banks: { name: string; code: string }[] = [];
  for (const b of json.data) {
    if (seen.has(b.code)) continue;
    seen.add(b.code);
    banks.push({ name: b.name, code: b.code });
  }
  return banks;
}

/** Verifies an account number actually belongs to the named bank and returns the
 *  account holder's real name — shown back to the organizer to confirm before saving,
 *  so a typo'd account number doesn't silently misroute their ticket revenue. */
export async function resolvePaystackAccount(accountNumber: string, bankCode: string): Promise<{ accountName: string }> {
  const res = await fetch(`${PAYSTACK_BASE}/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`, {
    headers: { Authorization: `Bearer ${paystackKey()}` },
  });
  const json = (await res.json()) as { status: boolean; message: string; data?: { account_name: string } };
  if (!res.ok || !json.status || !json.data) {
    throw new Error(json.message || "Couldn't verify that account number.");
  }
  return { accountName: json.data.account_name };
}

/** Creates the Paystack Subaccount that ticket revenue for this organization's events
 *  will split into — the subaccount's own bank account receives every sale
 *  automatically minus percentageCharge (eventbuddy's platform fee), on Paystack's
 *  normal settlement schedule. eventbuddy itself never touches or forwards this money. */
export async function createPaystackSubaccount(params: {
  businessName: string;
  bankCode: string;
  accountNumber: string;
  percentageCharge: number;
}): Promise<{ subaccountCode: string }> {
  const res = await fetch(`${PAYSTACK_BASE}/subaccount`, {
    method: "POST",
    headers: { Authorization: `Bearer ${paystackKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      business_name: params.businessName,
      settlement_bank: params.bankCode,
      account_number: params.accountNumber,
      percentage_charge: params.percentageCharge,
    }),
  });
  const json = (await res.json()) as { status: boolean; message: string; data?: { subaccount_code: string } };
  if (!res.ok || !json.status || !json.data) {
    throw new Error(json.message || "Couldn't set up payouts for this organization.");
  }
  return { subaccountCode: json.data.subaccount_code };
}

/** Changes an existing subaccount's platform fee percentage — needed because
 *  percentage_charge is otherwise fixed at creation time (e.g. when an org's
 *  fee-exempt status changes after they already have payouts set up). Paystack's
 *  update endpoint expects the subaccount's other fields resent alongside the one
 *  actually changing; callers pass the values already on file in `organizations`
 *  (bank code, account number, business name) rather than round-tripping through
 *  a GET first, since Paystack's read shape for settlement_bank (a name) doesn't
 *  match what the write shape expects (a code). */
export async function updatePaystackSubaccountPercentage(params: {
  subaccountCode: string;
  businessName: string;
  bankCode: string;
  accountNumber: string;
  percentageCharge: number;
}): Promise<void> {
  const res = await fetch(`${PAYSTACK_BASE}/subaccount/${encodeURIComponent(params.subaccountCode)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${paystackKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      business_name: params.businessName,
      settlement_bank: params.bankCode,
      account_number: params.accountNumber,
      percentage_charge: params.percentageCharge,
    }),
  });
  const json = (await res.json()) as { status: boolean; message: string };
  if (!res.ok || !json.status) {
    throw new Error(json.message || "Couldn't update this organization's commission rate.");
  }
}

type PaystackVerifyResponse = {
  status: boolean;
  message: string;
  data?: { status: string; reference: string; amount: number; currency: string; metadata: unknown };
};

export type PaystackVerification = { status: string; reference: string; amount: number; currency: string; metadata: unknown };

export async function paystackVerify(reference: string): Promise<PaystackVerification> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${paystackKey()}` },
  });
  const json = (await res.json()) as PaystackVerifyResponse;
  if (!res.ok || !json.status || !json.data) {
    throw new Error(json.message || "Couldn't verify payment.");
  }
  return json.data;
}

export type FinalizeResult =
  | { ok: true; purpose: "ticket_purchase"; eventId: string; referenceId: string | null; hubUrl?: string; alreadyProcessed: boolean }
  | { ok: true; purpose: "other"; eventId: string; alreadyProcessed: true }
  | { ok: false; reason: "unknown_reference" | "payment_failed" | "amount_mismatch" | "verify_error" };

/** Best-effort — resolves the same Hub link a fresh fulfillment would have emailed,
 *  for the "already processed" replay paths (a page reload, or the webhook and the
 *  callback page racing) where fulfillment itself doesn't run again. The member row
 *  already exists from the original successful run, so this is a lookup in
 *  practice; ensureHubMember's insert-or-fetch shape handles that safely either way. */
async function resolveHubUrlForTxn(supabase: SupabaseClient, txn: PendingTicketTxn): Promise<string | undefined> {
  const info = txn.registrant_data;
  if (!info) return undefined;
  try {
    const { data: org } = await supabase.from("organizations").select("slug").eq("id", txn.organization_id).maybeSingle();
    if (!org?.slug) return undefined;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://eventbuddy.africa";
    const { hubToken } = await ensureHubMember(supabase, {
      organizationId: txn.organization_id,
      eventId: txn.event_id,
      email: info.email,
      fullName: `${info.firstName} ${info.lastName}`,
    });
    return buildHubUrl(siteUrl, org.slug, txn.event_id, hubToken);
  } catch {
    return undefined;
  }
}

/**
 * The single place both the webhook and the post-checkout callback page call to
 * actually mark a payment as done — idempotent by design, since Paystack can (and
 * does) deliver the webhook more than once, and a user's browser redirect back can
 * race with it. Safe to call concurrently or repeatedly for the same reference: only
 * the first caller to see status still 'pending' does anything; every other caller
 * (including a genuine retry) gets alreadyProcessed: true and touches nothing.
 *
 * 'ticket_purchase' is the only purpose ever created going forward (the flat
 * event-publish fee was scrapped — see migration 0045): creates the attendee's
 * registration/lead row from the pending `registrant_data` and emails their
 * confirmation. Any other purpose can only be a historical row from before
 * that change; it's treated as an inert, already-settled record rather than
 * acted on.
 */
export async function finalizePaystackTransaction(supabase: SupabaseClient, reference: string): Promise<FinalizeResult> {
  const { data: txn } = await supabase.from("paystack_transactions").select("*").eq("reference", reference).maybeSingle();
  if (!txn) return { ok: false, reason: "unknown_reference" };

  if (txn.purpose !== "ticket_purchase") {
    return { ok: true, purpose: "other", eventId: txn.event_id, alreadyProcessed: true };
  }

  if (txn.status === "success") {
    const { data: existing } = await supabase
      .from("registrations")
      .select("reference_id")
      .eq("event_id", txn.event_id)
      .eq("email", (txn.registrant_data as { email?: string } | null)?.email ?? "")
      .eq("ticket_type_id", txn.ticket_type_id)
      .maybeSingle();
    const hubUrl = await resolveHubUrlForTxn(supabase, txn);
    return { ok: true, purpose: "ticket_purchase", eventId: txn.event_id, referenceId: existing?.reference_id ?? null, hubUrl, alreadyProcessed: true };
  }

  let verified: PaystackVerification;
  try {
    verified = await paystackVerify(reference);
  } catch {
    return { ok: false, reason: "verify_error" };
  }

  if (verified.status !== "success") {
    await supabase.from("paystack_transactions").update({ status: "failed", paystack_event: verified }).eq("reference", reference).eq("status", "pending");
    return { ok: false, reason: "payment_failed" };
  }

  // Refuse to complete for less than it actually costs — compares against the exact
  // integer amount recorded at initialize time (charge_amount_minor), never
  // recomputed from amount_naira, so a tampered/replayed reference can't slip a short
  // payment through.
  if (verified.currency !== txn.charge_currency || verified.amount < Number(txn.charge_amount_minor)) {
    await supabase.from("paystack_transactions").update({ status: "failed", paystack_event: verified }).eq("reference", reference).eq("status", "pending");
    return { ok: false, reason: "amount_mismatch" };
  }

  // The idempotency boundary: this UPDATE only ever matches a row while it's still
  // 'pending'. If two callers race (webhook + callback page both verifying at once),
  // exactly one of these succeeds and returns the updated row; the other matches zero
  // rows and falls through to alreadyProcessed below.
  const { data: updated } = await supabase
    .from("paystack_transactions")
    .update({ status: "success", verified_at: new Date().toISOString(), paystack_event: verified })
    .eq("reference", reference)
    .eq("status", "pending")
    .select()
    .maybeSingle();

  if (!updated) {
    const hubUrl = await resolveHubUrlForTxn(supabase, txn);
    return { ok: true, purpose: "ticket_purchase", eventId: txn.event_id, referenceId: null, hubUrl, alreadyProcessed: true };
  }

  const { referenceId, hubUrl } = await createTicketPurchaseRegistration(supabase, txn);
  return { ok: true, purpose: "ticket_purchase", eventId: txn.event_id, referenceId, hubUrl, alreadyProcessed: false };
}

type PendingTicketTxn = {
  id: string;
  organization_id: string;
  event_id: string;
  ticket_type_id: string | null;
  discount_code_id: string | null;
  registrant_data: { firstName: string; lastName: string; email: string; phone: string | null; customAnswers?: Record<string, string | string[]> } | null;
};

/** Materializes a paid ticket into a real registration (physical) or lead (virtual) —
 *  only ever reached once per transaction, right after the idempotency boundary above
 *  flips it to 'success', so this never double-books a ticket sale. */
async function createTicketPurchaseRegistration(supabase: SupabaseClient, txn: PendingTicketTxn): Promise<{ referenceId: string | null; hubUrl?: string }> {
  // Every early return past this point means a payment already succeeded but
  // fulfillment didn't — there is no user-facing retry for that (the transaction is
  // already 'success', so a caller retry short-circuits to alreadyProcessed and never
  // calls this again). Logging is the only way that failure is ever discoverable, so
  // every such branch below logs before returning null.
  const info = txn.registrant_data;
  if (!info) {
    console.error(`[ticket-purchase] no registrant_data on transaction for event ${txn.event_id} — cannot create registration.`);
    return { referenceId: null };
  }

  const { data: event, error: eventErr } = await supabase
    .from("events")
    .select("name, date, start_time, end_time, event_format, virtual_join_url, virtual_platform, virtual_access_notes, venue, location")
    .eq("id", txn.event_id)
    .maybeSingle();
  if (!event) {
    console.error(`[ticket-purchase] couldn't load event ${txn.event_id} to fulfill a paid ticket for ${info.email}:`, eventErr?.message);
    return { referenceId: null };
  }

  /** Best-effort — a Hub-provisioning failure should never block ticket
   *  fulfillment; the confirmation email still sends everything the attendee
   *  actually needs (QR/reference or join link) even if this comes back undefined. */
  async function tryHubUrl(attendeeEmail: string, attendeeName: string): Promise<string | undefined> {
    try {
      const { data: org } = await supabase.from("organizations").select("slug").eq("id", txn.organization_id).maybeSingle();
      if (!org?.slug) return undefined;
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://eventbuddy.africa";
      const { hubToken } = await ensureHubMember(supabase, { organizationId: txn.organization_id, eventId: txn.event_id, email: attendeeEmail, fullName: attendeeName });
      return buildHubUrl(siteUrl, org.slug, txn.event_id, hubToken);
    } catch {
      return undefined;
    }
  }

  if (txn.ticket_type_id) {
    // Atomic guarded UPDATE (see 0038_atomic_ticket_discount_counters.sql), not a
    // read-then-write — the payment is already taken at this point, so a `false`
    // result means the event sold out from under this buyer in a race and needs
    // manual reconciliation (refund or a seat added), not a silent failure.
    const { data: incremented, error: incrementErr } = await supabase.rpc("increment_ticket_sold", { p_ticket_type_id: txn.ticket_type_id });
    if (incrementErr) {
      console.error(`[ticket-purchase] couldn't increment quantity_sold for ticket ${txn.ticket_type_id}:`, incrementErr.message);
    } else if (!incremented) {
      console.error(`[ticket-purchase] OVERSOLD: ticket type ${txn.ticket_type_id} was already at capacity when a paid registration for ${info.email} was fulfilled — needs manual review.`);
    }
  }

  if (txn.discount_code_id) {
    const { data: incremented, error: incrementErr } = await supabase.rpc("increment_discount_uses", { p_discount_code_id: txn.discount_code_id });
    if (incrementErr) {
      console.error(`[ticket-purchase] couldn't increment uses_count for discount code ${txn.discount_code_id}:`, incrementErr.message);
    } else if (!incremented) {
      console.error(`[ticket-purchase] discount code ${txn.discount_code_id} was already at its use limit when a paid registration for ${info.email} was fulfilled — needs manual review.`);
    }
  }

  if (event.event_format === "virtual") {
    const { error: leadErr } = await supabase.from("leads").insert({
      organization_id: txn.organization_id,
      event_id: txn.event_id,
      first_name: info.firstName,
      last_name: info.lastName,
      email: info.email,
      phone: info.phone || "",
      preferred_course: "",
      level_of_interest: "",
      start_year: "",
      highest_education: "",
      taken_ielts: "",
      comments: "",
      custom_answers: info.customAnswers || {},
    });
    if (leadErr) {
      console.error(`[ticket-purchase] paid ticket for ${info.email} on event ${txn.event_id} succeeded but no lead could be created:`, leadErr.message);
      return { referenceId: null };
    }
    const virtualHub = await tryHubUrl(info.email, `${info.firstName} ${info.lastName}`);
    await sendVirtualConfirmationEmail(info.email, event, virtualHub);
    return { referenceId: null, hubUrl: virtualHub };
  }

  let referenceId: string | null = null;
  let registrationId: string | null = null;
  let lastError: { message: string; code?: string } | null = null;
  for (let attempt = 0; attempt < 5 && !referenceId; attempt++) {
    const candidate = generateReferenceId();
    const { data, error } = await supabase
      .from("registrations")
      .insert({
        organization_id: txn.organization_id,
        event_id: txn.event_id,
        ticket_type_id: txn.ticket_type_id,
        reference_id: candidate,
        full_name: `${info.firstName} ${info.lastName}`,
        email: info.email,
        phone: info.phone || null,
        custom_answers: info.customAnswers || {},
      })
      .select()
      .single();
    if (data) {
      referenceId = candidate;
      registrationId = data.id;
    } else {
      lastError = error;
      if (error?.code !== "23505") break;
    }
  }
  if (!referenceId) {
    console.error(`[ticket-purchase] paid ticket for ${info.email} on event ${txn.event_id} succeeded but no registration could be created:`, lastError?.message);
    return { referenceId: null };
  }

  // Links the transaction back to the exact registration it created, so a later
  // refund/dispute (see handleRefundOrDispute) can find and cancel this specific
  // row instead of guessing by email/ticket-type match.
  await supabase.from("paystack_transactions").update({ registration_id: registrationId }).eq("id", txn.id);

  const physicalHub = await tryHubUrl(info.email, `${info.firstName} ${info.lastName}`);
  await sendRegistrationEmail(info.email, referenceId, event, physicalHub);
  return { referenceId, hubUrl: physicalHub };
}

/** Best-effort — the refund/dispute itself is already recorded by the time this
 *  runs, so a Resend hiccup shouldn't be treated as a failure of the whole
 *  webhook. Deliberately a plain notice, not an action button: reversing a
 *  charge is something the organizer follows up on manually (deny entry, chase
 *  a chargeback response), not something this app can undo for them. */
async function sendRefundNoticeEmail(to: string, eventName: string, kind: "refunded" | "disputed", amountNaira: number) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  const safeEvent = escapeHtml(eventName);
  const verb = kind === "refunded" ? "refunded" : "disputed (chargeback filed)";
  const bodyHtml = `
    <h1 style="font-size:19px; margin:0 0 12px;">A payment for ${safeEvent} was ${verb}</h1>
    <p style="margin:0 0 20px; color:#666;">
      A ticket purchase worth ${escapeHtml(formatNaira(amountNaira))} for <strong>${safeEvent}</strong> has been ${verb} on Paystack.
      The attendee's registration has been marked cancelled and any ticket/discount-code capacity it used has been restored automatically.
      You may want to follow up directly if this affects who should be let in at check-in.
    </p>
    ${emailButton(`${process.env.NEXT_PUBLIC_SITE_URL || "https://eventbuddy.africa"}/dashboard`, "View your dashboard", "#9a3412")}
  `;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: `Payment ${kind} — ${eventName}`,
      text: `A ticket purchase for ${eventName} (${formatNaira(amountNaira)}) has been ${verb}. The registration has been cancelled and capacity restored automatically.`,
      html: renderEmailShell({ color: "#9a3412", label: kind === "refunded" ? "Refund" : "Dispute", emoji: "⚠️" }, bodyHtml),
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Handles a Paystack refund.processed or charge.dispute.create webhook event —
 * previously these were silently acknowledged and dropped, leaving a refunded/
 * disputed ticket permanently valid with no record the money came back out.
 * The status-transition UPDATE itself is the concurrency guard (same pattern as
 * finalizePaystackTransaction's `.eq("status", "pending")`): it only fires when
 * the row's status still matches what we just read, so of two concurrent calls
 * (a redelivered webhook racing a manual-refund click, say) only one actually
 * flips the row and runs the capacity-restoring side effects.
 */
export async function handleRefundOrDispute(supabase: SupabaseClient, reference: string, kind: "refunded" | "disputed"): Promise<{ handled: boolean }> {
  const { data: txn } = await supabase.from("paystack_transactions").select("*").eq("reference", reference).maybeSingle();
  if (!txn) return { handled: false };
  if (txn.status === kind) return { handled: true };

  const { data: updated } = await supabase
    .from("paystack_transactions")
    .update({ status: kind })
    .eq("id", txn.id)
    .eq("status", txn.status)
    .select()
    .maybeSingle();
  if (!updated) return { handled: true };

  if (txn.purpose === "ticket_purchase") {
    if (txn.registration_id) {
      await supabase.from("registrations").update({ status: "cancelled" }).eq("id", txn.registration_id);
    }
    if (txn.ticket_type_id) {
      await supabase.rpc("decrement_ticket_sold", { p_ticket_type_id: txn.ticket_type_id });
    }
    if (txn.discount_code_id) {
      await supabase.rpc("decrement_discount_uses", { p_discount_code_id: txn.discount_code_id });
    }
  }
  // Any other purpose (historical event-publish transactions only — that flat
  // fee was scrapped, see migration 0045) has nothing left to react to: a
  // physical event's published state no longer depends on payment at all.

  try {
    const { data: org } = await supabase.from("organizations").select("email").eq("id", txn.organization_id).maybeSingle();
    if (org?.email) {
      const { data: event } = await supabase.from("events").select("name").eq("id", txn.event_id).maybeSingle();
      await sendRefundNoticeEmail(org.email, event?.name || "your event", kind, Number(txn.amount_naira));
    }
  } catch {
    // Swallowed — the refund/dispute is already recorded regardless of whether
    // the notice email goes out.
  }

  return { handled: true };
}
