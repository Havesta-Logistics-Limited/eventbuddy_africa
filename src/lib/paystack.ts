import type { SupabaseClient } from "@supabase/supabase-js";
import { generateReferenceId } from "@/lib/utils";
import { sendRegistrationEmail, sendVirtualConfirmationEmail } from "@/lib/registration-email";

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
  /** A Paystack subaccount code — when set, this charge is a split payment: the
   *  subaccount's registered bank account gets the sale minus its own
   *  percentage_charge (eventbuddy's cut), settled automatically by Paystack. Omit
   *  for charges that go entirely to the platform's own account (event-publish fees). */
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
  | { ok: true; purpose: "event_publish"; eventId: string; alreadyProcessed: boolean }
  | { ok: true; purpose: "ticket_purchase"; eventId: string; referenceId: string | null; alreadyProcessed: boolean }
  | { ok: false; reason: "unknown_reference" | "payment_failed" | "amount_mismatch" | "verify_error" };

/**
 * The single place both the webhook and the post-checkout callback page call to
 * actually mark a payment as done — idempotent by design, since Paystack can (and
 * does) deliver the webhook more than once, and a user's browser redirect back can
 * race with it. Safe to call concurrently or repeatedly for the same reference: only
 * the first caller to see status still 'pending' does anything; every other caller
 * (including a genuine retry) gets alreadyProcessed: true and touches nothing.
 *
 * Branches on `purpose`: 'event_publish' (original behavior — flips the event to
 * published) or 'ticket_purchase' (creates the attendee's registration/lead row from
 * the pending `registrant_data` and emails their confirmation — mirrors why a paid
 * event isn't published until paid: a paid ticket must not exist until it's paid for).
 */
export async function finalizePaystackTransaction(supabase: SupabaseClient, reference: string): Promise<FinalizeResult> {
  const { data: txn } = await supabase.from("paystack_transactions").select("*").eq("reference", reference).maybeSingle();
  if (!txn) return { ok: false, reason: "unknown_reference" };
  if (txn.status === "success") {
    if (txn.purpose === "ticket_purchase") {
      const { data: existing } = await supabase
        .from("registrations")
        .select("reference_id")
        .eq("event_id", txn.event_id)
        .eq("email", (txn.registrant_data as { email?: string } | null)?.email ?? "")
        .eq("ticket_type_id", txn.ticket_type_id)
        .maybeSingle();
      return { ok: true, purpose: "ticket_purchase", eventId: txn.event_id, referenceId: existing?.reference_id ?? null, alreadyProcessed: true };
    }
    return { ok: true, purpose: "event_publish", eventId: txn.event_id, alreadyProcessed: true };
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
    if (txn.purpose === "ticket_purchase") {
      return { ok: true, purpose: "ticket_purchase", eventId: txn.event_id, referenceId: null, alreadyProcessed: true };
    }
    return { ok: true, purpose: "event_publish", eventId: txn.event_id, alreadyProcessed: true };
  }

  if (txn.purpose === "ticket_purchase") {
    const referenceId = await createTicketPurchaseRegistration(supabase, txn);
    return { ok: true, purpose: "ticket_purchase", eventId: txn.event_id, referenceId, alreadyProcessed: false };
  }

  await supabase.from("events").update({ published: true, payment_status: "paid" }).eq("id", txn.event_id);
  return { ok: true, purpose: "event_publish", eventId: txn.event_id, alreadyProcessed: false };
}

type PendingTicketTxn = {
  organization_id: string;
  event_id: string;
  ticket_type_id: string | null;
  discount_code_id: string | null;
  registrant_data: { firstName: string; lastName: string; email: string; phone: string | null; customAnswers?: Record<string, string | string[]> } | null;
};

/** Materializes a paid ticket into a real registration (physical) or lead (virtual) —
 *  only ever reached once per transaction, right after the idempotency boundary above
 *  flips it to 'success', so this never double-books a ticket sale. */
async function createTicketPurchaseRegistration(supabase: SupabaseClient, txn: PendingTicketTxn): Promise<string | null> {
  // Every early return past this point means a payment already succeeded but
  // fulfillment didn't — there is no user-facing retry for that (the transaction is
  // already 'success', so a caller retry short-circuits to alreadyProcessed and never
  // calls this again). Logging is the only way that failure is ever discoverable, so
  // every such branch below logs before returning null.
  const info = txn.registrant_data;
  if (!info) {
    console.error(`[ticket-purchase] no registrant_data on transaction for event ${txn.event_id} — cannot create registration.`);
    return null;
  }

  const { data: event, error: eventErr } = await supabase
    .from("events")
    .select("name, date, start_time, end_time, event_format, virtual_join_url, virtual_platform, virtual_access_notes, venue, location")
    .eq("id", txn.event_id)
    .maybeSingle();
  if (!event) {
    console.error(`[ticket-purchase] couldn't load event ${txn.event_id} to fulfill a paid ticket for ${info.email}:`, eventErr?.message);
    return null;
  }

  if (txn.ticket_type_id) {
    const { data: ticket, error: ticketErr } = await supabase.from("ticket_types").select("quantity_sold").eq("id", txn.ticket_type_id).maybeSingle();
    if (ticket) {
      const { error: incrementErr } = await supabase
        .from("ticket_types")
        .update({ quantity_sold: ticket.quantity_sold + 1 })
        .eq("id", txn.ticket_type_id);
      if (incrementErr) console.error(`[ticket-purchase] couldn't increment quantity_sold for ticket ${txn.ticket_type_id}:`, incrementErr.message);
    } else if (ticketErr) {
      console.error(`[ticket-purchase] couldn't load ticket type ${txn.ticket_type_id} to increment quantity_sold:`, ticketErr.message);
    }
  }

  if (txn.discount_code_id) {
    const { data: code, error: codeErr } = await supabase.from("discount_codes").select("uses_count").eq("id", txn.discount_code_id).maybeSingle();
    if (code) {
      const { error: incrementErr } = await supabase.from("discount_codes").update({ uses_count: code.uses_count + 1 }).eq("id", txn.discount_code_id);
      if (incrementErr) console.error(`[ticket-purchase] couldn't increment uses_count for discount code ${txn.discount_code_id}:`, incrementErr.message);
    } else if (codeErr) {
      console.error(`[ticket-purchase] couldn't load discount code ${txn.discount_code_id} to increment uses_count:`, codeErr.message);
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
      return null;
    }
    await sendVirtualConfirmationEmail(info.email, event);
    return null;
  }

  let referenceId: string | null = null;
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
    if (data) referenceId = candidate;
    else {
      lastError = error;
      if (error?.code !== "23505") break;
    }
  }
  if (!referenceId) {
    console.error(`[ticket-purchase] paid ticket for ${info.email} on event ${txn.event_id} succeeded but no registration could be created:`, lastError?.message);
    return null;
  }

  await sendRegistrationEmail(info.email, referenceId, event);
  return referenceId;
}
