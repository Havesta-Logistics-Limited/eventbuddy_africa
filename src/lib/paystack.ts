import type { SupabaseClient } from "@supabase/supabase-js";
import { recordSaleRisk } from "./sales-guard";
import { emailPaid, exhibitorPortalUrl } from "./exhibitors";
import { Resend } from "resend";
import { generateReferenceId } from "@/lib/utils";
import { sendRegistrationEmail, sendVirtualConfirmationEmail } from "@/lib/registration-email";
import { sendPushToAttendee } from "@/lib/push";
import { ensureHubMember, hubUrl as buildHubUrl } from "@/lib/event-hub";
import { emailButton, escapeHtml, renderEmailShell } from "@/lib/email-template";
import { formatNaira } from "@/lib/billing";
import { promoterCommission } from "@/lib/promoters";

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
  /** eventbuddy's exact cut of THIS payment, in kobo (Paystack's
   *  transaction_charge). Overrides the subaccount's stored percentage_charge for
   *  this one charge — how the percentage + flat fee model is applied per sale.
   *  Omitted (or 0) leaves the subaccount's own percentage in force, which is 0 for
   *  fee-exempt organizations. */
  transactionChargeMinor?: number;
  /** A Paystack plan code: the first charge also starts a monthly
   *  subscription to it (organizer plans, migration 0104). */
  plan?: string;
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
      ...(params.subaccount && params.transactionChargeMinor && params.transactionChargeMinor > 0
        ? { transaction_charge: params.transactionChargeMinor }
        : {}),
      ...(params.plan ? { plan: params.plan } : {}),
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

/** Actually reverses a charge on Paystack (as opposed to handleRefundOrDispute below,
 *  which only reconciles a refund that already happened externally) — always a full
 *  refund of the original amount, no partial-refund support in this pass. Paystack
 *  queues refunds for async processing rather than confirming settlement inline, so a
 *  `true` return here means "accepted", not "money has already moved". */
export async function paystackRefund(reference: string): Promise<void> {
  const res = await fetch(`${PAYSTACK_BASE}/refund`, {
    method: "POST",
    headers: { Authorization: `Bearer ${paystackKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ transaction: reference }),
  });
  const json = (await res.json()) as { status: boolean; message: string };
  if (!res.ok || !json.status) {
    throw new Error(json.message || "Paystack couldn't process this refund.");
  }
}

// ---- Organizer plans: Paystack Subscriptions (migration 0104) ----------------

/** One month from `from`, for a plan period. Paystack's subscription webhook
 *  later replaces it with the real next_payment_date. */
function oneMonthFrom(from: Date): string {
  const d = new Date(from);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

/** First payment of a paid plan: verifies it like a ticket payment, then moves
 *  the organization onto the plan. Idempotent on the transaction status. */
async function finalizeSubscriptionPayment(
  supabase: SupabaseClient,
  txn: { id: string; reference: string; organization_id: string; status: string; plan_id: string | null; charge_amount_minor: number | string; charge_currency: string }
): Promise<FinalizeResult> {
  const planId = txn.plan_id ?? "launch";
  if (txn.status === "success") return { ok: true, purpose: "subscription", planId, alreadyProcessed: true };
  let verified: PaystackVerification;
  try {
    verified = await paystackVerify(txn.reference);
  } catch {
    return { ok: false, reason: "verify_error" };
  }
  if (verified.status !== "success" || verified.currency !== txn.charge_currency || verified.amount < Number(txn.charge_amount_minor)) {
    await supabase.from("paystack_transactions").update({ status: "failed", paystack_event: verified }).eq("id", txn.id).eq("status", "pending");
    return { ok: false, reason: verified.status !== "success" ? "payment_failed" : "amount_mismatch" };
  }
  const { data: updated } = await supabase
    .from("paystack_transactions")
    .update({ status: "success", verified_at: new Date().toISOString(), paystack_event: verified, platform_fee_naira: Number(txn.charge_amount_minor) / 100, net_amount_naira: 0 })
    .eq("id", txn.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!updated) return { ok: true, purpose: "subscription", planId, alreadyProcessed: true };
  const customerCode = (verified as { customer?: { customer_code?: string } }).customer?.customer_code ?? null;
  await supabase
    .from("organizations")
    .update({
      plan_id: planId,
      plan_status: "active",
      plan_comped: false,
      plan_period_end: oneMonthFrom(new Date()),
      ...(customerCode ? { paystack_customer_code: customerCode } : {}),
    })
    .eq("id", txn.organization_id);
  return { ok: true, purpose: "subscription", planId, alreadyProcessed: false };
}

/** Creates or updates the Paystack plan behind an organizer plan; returns its code. */
export async function upsertPaystackPlan(params: { code?: string | null; name: string; amountMinor: number }): Promise<string> {
  const body = JSON.stringify({ name: `eventbuddy ${params.name}`, amount: params.amountMinor, interval: "monthly", currency: "NGN" });
  const res = await fetch(params.code ? `${PAYSTACK_BASE}/plan/${encodeURIComponent(params.code)}` : `${PAYSTACK_BASE}/plan`, {
    method: params.code ? "PUT" : "POST",
    headers: { Authorization: `Bearer ${paystackKey()}`, "Content-Type": "application/json" },
    body,
  });
  const json = (await res.json()) as { status: boolean; message: string; data?: { plan_code?: string } };
  if (!res.ok || !json.status) throw new Error(json.message || "Paystack couldn't save this plan.");
  return params.code ?? json.data!.plan_code!;
}

/** Stops a subscription renewing. The organization keeps the plan until its
 *  current period ends (effective_plan_id handles the lapse). */
export async function disablePaystackSubscription(code: string, token: string): Promise<void> {
  const res = await fetch(`${PAYSTACK_BASE}/subscription/disable`, {
    method: "POST",
    headers: { Authorization: `Bearer ${paystackKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ code, token }),
  });
  const json = (await res.json()) as { status: boolean; message: string };
  if (!res.ok || !json.status) throw new Error(json.message || "Paystack couldn't cancel this subscription.");
}

type SubscriptionEventData = {
  subscription_code?: string;
  email_token?: string;
  next_payment_date?: string;
  status?: string;
  customer?: { customer_code?: string };
  plan?: { plan_code?: string };
  subscription?: { subscription_code?: string; next_payment_date?: string };
  paid_at?: string;
};

/** Paystack subscription lifecycle webhooks → the organization's plan. Matched
 *  by customer code, set when the first plan payment finalized. */
export async function handleSubscriptionEvent(supabase: SupabaseClient, event: string, data: SubscriptionEventData): Promise<boolean> {
  const customerCode = data.customer?.customer_code;
  if (!customerCode) return false;
  const { data: org } = await supabase.from("organizations").select("id, plan_id").eq("paystack_customer_code", customerCode).maybeSingle();
  if (!org) return false;
  const planCode = data.plan?.plan_code;
  const { data: plan } = planCode ? await supabase.from("organizer_plans").select("id").eq("paystack_plan_code", planCode).maybeSingle() : { data: null };

  if (event === "subscription.create") {
    await supabase
      .from("organizations")
      .update({
        ...(plan ? { plan_id: plan.id } : {}),
        plan_status: "active",
        plan_comped: false,
        paystack_subscription_code: data.subscription_code ?? null,
        paystack_subscription_token: data.email_token ?? null,
        ...(data.next_payment_date ? { plan_period_end: data.next_payment_date } : {}),
      })
      .eq("id", org.id);
  } else if (event === "charge.success" && plan) {
    // a monthly renewal: extend the period
    const next = data.subscription?.next_payment_date ?? oneMonthFrom(data.paid_at ? new Date(data.paid_at) : new Date());
    await supabase.from("organizations").update({ plan_id: plan.id, plan_status: "active", plan_period_end: next }).eq("id", org.id);
  } else if (event === "invoice.payment_failed") {
    await supabase.from("organizations").update({ plan_status: "past_due" }).eq("id", org.id);
  } else if (event === "subscription.not_renew" || event === "subscription.disable") {
    await supabase.from("organizations").update({ plan_status: "cancelling" }).eq("id", org.id);
  } else {
    return false;
  }
  return true;
}

/** Creates (or, for the same account, re-fetches) a Paystack transfer
 *  recipient for a Nigerian bank account: the "who" of a payout transfer. */
export async function createTransferRecipient(params: { name: string; accountNumber: string; bankCode: string }): Promise<{ recipientCode: string }> {
  const res = await fetch(`${PAYSTACK_BASE}/transferrecipient`, {
    method: "POST",
    headers: { Authorization: `Bearer ${paystackKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "nuban", name: params.name, account_number: params.accountNumber, bank_code: params.bankCode, currency: "NGN" }),
  });
  const json = (await res.json()) as { status: boolean; message: string; data?: { recipient_code: string } };
  if (!res.ok || !json.status || !json.data) throw new Error(json.message || "Paystack couldn't register this bank account for payouts.");
  return { recipientCode: json.data.recipient_code };
}

/** Sends money from eventbuddy's Paystack balance to a recipient. Needs
 *  Transfers enabled on the Paystack account with the OTP requirement turned
 *  off; Paystack reports the outcome later via transfer.success / .failed /
 *  .reversed webhooks, keyed by our `reference`. */
export async function initiateTransfer(params: { amountMinor: number; recipientCode: string; reference: string; reason: string }): Promise<{ transferCode: string; status: string }> {
  const res = await fetch(`${PAYSTACK_BASE}/transfer`, {
    method: "POST",
    headers: { Authorization: `Bearer ${paystackKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ source: "balance", amount: params.amountMinor, recipient: params.recipientCode, reference: params.reference, reason: params.reason, currency: "NGN" }),
  });
  const json = (await res.json()) as { status: boolean; message: string; data?: { transfer_code: string; status: string } };
  if (!res.ok || !json.status || !json.data) throw new Error(json.message || "Paystack couldn't send this payout.");
  return { transferCode: json.data.transfer_code, status: json.data.status };
}

/** Applies a Paystack transfer webhook to its payout request. Idempotent:
 *  only a payout still 'processing' moves, so redelivered webhooks are no-ops. */
export async function handleTransferEvent(supabase: SupabaseClient, reference: string, outcome: "success" | "failed" | "reversed", reason?: string): Promise<void> {
  const { data: payout } = await supabase.from("payout_requests").select("id, status").eq("transfer_reference", reference).maybeSingle();
  if (!payout || payout.status !== "processing") return;
  if (outcome === "success") {
    await supabase.from("payout_requests").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", payout.id).eq("status", "processing");
  } else {
    const { error } = await supabase.rpc("return_payout", {
      p_payout: payout.id,
      p_status: "failed",
      p_note: reason || (outcome === "reversed" ? "Transfer reversed by the bank" : "Transfer failed"),
      p_by: null,
    });
    if (error) console.error(`[payouts] couldn't return failed payout ${payout.id}:`, error.message);
  }
}

export type FinalizeResult =
  | { ok: true; purpose: "ticket_purchase"; eventId: string; referenceId: string | null; hubUrl?: string; alreadyProcessed: boolean }
  | { ok: true; purpose: "subscription"; planId: string; alreadyProcessed: boolean }
  | { ok: true; purpose: "other"; eventId: string; alreadyProcessed: true }
  | { ok: true; purpose: "stand_booking"; eventId: string; alreadyProcessed: boolean }
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
    return buildHubUrl(siteUrl, org.slug, { id: txn.event_id }, hubToken);
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
/** The reference ID a successful ticket transaction produced, for a caller
 *  that arrives after another one already claimed the transaction (the
 *  webhook and the confirmation page both finalize; the page can also fire
 *  twice). The first caller flips the status to success and only then creates
 *  the registration, which takes a few seconds, so a second caller can get
 *  here before it exists. Read the transaction's own registration_id, waiting
 *  briefly for it, instead of guessing by email (which also broke for anyone
 *  holding two tickets). Virtual events have no reference and return null. */
async function awaitFulfilledReference(
  supabase: SupabaseClient,
  txn: { id: string; event_id: string; registrant_data?: unknown; ticket_type_id?: string | null }
): Promise<string | null> {
  const { data: event } = await supabase.from("events").select("event_format").eq("id", txn.event_id).maybeSingle();
  if (event?.event_format === "virtual") return null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const { data: row } = await supabase.from("paystack_transactions").select("registration_id").eq("id", txn.id).maybeSingle();
    if (row?.registration_id) {
      const { data: reg } = await supabase.from("registrations").select("reference_id").eq("id", row.registration_id).maybeSingle();
      if (reg?.reference_id) return reg.reference_id;
    }
    await new Promise((r) => setTimeout(r, 750));
  }
  // Older transactions (before registration_id was recorded) fall back to the
  // buyer's newest registration for this ticket type.
  const { data: fallback } = await supabase
    .from("registrations")
    .select("reference_id")
    .eq("event_id", txn.event_id)
    .eq("email", (txn.registrant_data as { email?: string } | null)?.email ?? "")
    .eq("ticket_type_id", txn.ticket_type_id ?? "")
    .is("group_lead_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return fallback?.reference_id ?? null;
}

export async function finalizePaystackTransaction(supabase: SupabaseClient, reference: string): Promise<FinalizeResult> {
  const { data: txn } = await supabase.from("paystack_transactions").select("*").eq("reference", reference).maybeSingle();
  if (!txn) return { ok: false, reason: "unknown_reference" };

  if (txn.purpose === "subscription") {
    return finalizeSubscriptionPayment(supabase, txn);
  }
  if (txn.purpose === "stand_booking") {
    return finalizeStandBooking(supabase, txn);
  }
  if (txn.purpose !== "ticket_purchase") {
    return { ok: true, purpose: "other", eventId: txn.event_id, alreadyProcessed: true };
  }

  if (txn.status === "success") {
    const referenceId = await awaitFulfilledReference(supabase, txn);
    const hubUrl = await resolveHubUrlForTxn(supabase, txn);
    return { ok: true, purpose: "ticket_purchase", eventId: txn.event_id, referenceId, hubUrl, alreadyProcessed: true };
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

  // eventbuddy's cut of this sale, as Paystack itself computed and deducted it via the
  // subaccount split — not recomputed from platform_settings, since a fee-exempt org or
  // a since-changed percentage_charge could otherwise disagree with what actually
  // happened on this specific charge. Absent entirely (no subaccount, a pre-payout-setup
  // historical row) reads as a 0 fee rather than failing the whole finalize.
  const feeMinor = Number((verified as { fees_split?: { integration?: number } }).fees_split?.integration ?? 0);
  // A held sale (migration 0102) has no split for Paystack to report: the fee
  // was computed and stored at initialize, and stays what it was.
  const isHeld = txn.settlement === "held";
  const platformFeeNaira = isHeld ? Number(txn.platform_fee_naira ?? 0) : Math.round((feeMinor / 100) * 100) / 100;
  const netAmountNaira = Math.round((Number(txn.amount_naira) - platformFeeNaira) * 100) / 100;

  // The idempotency boundary: this UPDATE only ever matches a row while it's still
  // 'pending'. If two callers race (webhook + callback page both verifying at once),
  // exactly one of these succeeds and returns the updated row; the other matches zero
  // rows and falls through to alreadyProcessed below.
  const { data: updated } = await supabase
    .from("paystack_transactions")
    .update({
      status: "success",
      verified_at: new Date().toISOString(),
      paystack_event: verified,
      platform_fee_naira: platformFeeNaira,
      net_amount_naira: netAmountNaira,
    })
    .eq("reference", reference)
    .eq("status", "pending")
    .select()
    .maybeSingle();

  if (!updated) {
    const hubUrl = await resolveHubUrlForTxn(supabase, txn);
    return { ok: true, purpose: "ticket_purchase", eventId: txn.event_id, referenceId: null, hubUrl, alreadyProcessed: true };
  }

  if (isHeld) await postHeldSale(supabase, txn, platformFeeNaira);
  if (Number(txn.amount_naira) > 0) await recordSaleRisk(supabase, txn.organization_id, txn.event_id);

  const { referenceId, hubUrl } = await createTicketPurchaseRegistration(supabase, txn);
  return { ok: true, purpose: "ticket_purchase", eventId: txn.event_id, referenceId, hubUrl, alreadyProcessed: false };
}

/** An exhibitor's stand payment (migration 0112): verified like a ticket,
 *  credited to the organizer's held balance, the booking marked paid, and
 *  both sides emailed. Idempotent on the pending → success update. */
async function finalizeStandBooking(
  supabase: SupabaseClient,
  txn: PendingTicketTxn & {
    status: string;
    reference: string;
    charge_currency: string;
    charge_amount_minor: number | string;
    amount_naira: number | string;
    platform_fee_naira?: number | string | null;
    exhibitor_id?: string | null;
  }
): Promise<FinalizeResult> {
  if (txn.status === "success") return { ok: true, purpose: "stand_booking", eventId: txn.event_id, alreadyProcessed: true };
  let verified: PaystackVerification;
  try {
    verified = await paystackVerify(txn.reference);
  } catch {
    return { ok: false, reason: "verify_error" };
  }
  if (verified.status !== "success") {
    await supabase.from("paystack_transactions").update({ status: "failed", paystack_event: verified }).eq("reference", txn.reference).eq("status", "pending");
    return { ok: false, reason: "payment_failed" };
  }
  if (verified.currency !== txn.charge_currency || verified.amount < Number(txn.charge_amount_minor)) {
    await supabase.from("paystack_transactions").update({ status: "failed", paystack_event: verified }).eq("reference", txn.reference).eq("status", "pending");
    return { ok: false, reason: "amount_mismatch" };
  }
  const feeNaira = Number(txn.platform_fee_naira ?? 0);
  const { data: updated } = await supabase
    .from("paystack_transactions")
    .update({ status: "success", verified_at: new Date().toISOString(), paystack_event: verified })
    .eq("reference", txn.reference)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!updated) return { ok: true, purpose: "stand_booking", eventId: txn.event_id, alreadyProcessed: true };

  await postHeldSale(supabase, txn, feeNaira, "Exhibitor stand");
  if (txn.exhibitor_id) {
    const { data: x } = await supabase
      .from("exhibitors")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", txn.exhibitor_id)
      // only an approval still standing is confirmed; a stand cancelled or
      // declined while the exhibitor was at checkout needs a refund instead
      .eq("status", "approved")
      .select("email, company_name, contact_name, stand_label, amount_naira, portal_token, events(name), stand_types(name), organizations(email)")
      .maybeSingle();
    if (!x) {
      console.error(`[stands] payment ${txn.reference} arrived for exhibitor ${txn.exhibitor_id} whose approval was cancelled or declined: refund it from the platform portal`);
      await supabase.from("risk_alerts").upsert(
        { organization_id: txn.organization_id, event_id: txn.event_id, kind: "sales_spike", tickets: 0, dedupe_key: `stand_paid_after_cancel:${txn.id}` },
        { onConflict: "dedupe_key", ignoreDuplicates: true }
      );
    }
    if (x) {
      const orgEmail = (x.organizations as unknown as { email: string | null } | null)?.email;
      // the exhibitor's copy carries their portal link; the organizer's doesn't
      const ctx = {
        company: x.company_name,
        contact: x.contact_name,
        eventName: (x.events as unknown as { name: string } | null)?.name ?? "the event",
        standName: (x.stand_types as unknown as { name: string } | null)?.name ?? "Stand",
        standLabel: x.stand_label,
        price: Number(x.amount_naira ?? txn.amount_naira),
      };
      const site = process.env.NEXT_PUBLIC_SITE_URL || "https://eventbuddy.africa";
      await emailPaid(x.email, { ...ctx, portalUrl: exhibitorPortalUrl(site, x.portal_token) });
      if (orgEmail) await emailPaid(orgEmail, ctx);
    }
  }
  return { ok: true, purpose: "stand_booking", eventId: txn.event_id, alreadyProcessed: false };
}

/** Credits a held sale to the organizer's ledger: the full sale, then
 *  eventbuddy's fee off it. Unique per (transaction, kind), so a webhook and
 *  the browser callback racing can't double-credit. A failure is logged, not
 *  thrown: the buyer has paid and must still get their ticket, and the entry
 *  can be re-posted from the transaction row. */
async function postHeldSale(
  supabase: SupabaseClient,
  txn: { id: string; organization_id: string; event_id: string; amount_naira: number | string; created_at?: string; referral_id?: string | null; registrant_data?: PendingTicketTxn["registrant_data"] },
  feeNaira: number,
  saleNote = "Ticket sale"
) {
  const { data: clearsAt } = await supabase.rpc("ledger_clear_time", { p_at: new Date().toISOString() });
  const rows = [
    { organization_id: txn.organization_id, event_id: txn.event_id, transaction_id: txn.id, kind: "sale", amount_naira: Number(txn.amount_naira), clears_at: clearsAt ?? new Date().toISOString(), note: saleNote },
    ...(feeNaira > 0
      ? // every row in one upsert must carry the same columns, or PostgREST sends
        // the missing ones as null instead of letting the default apply
        [{ organization_id: txn.organization_id, event_id: txn.event_id, transaction_id: txn.id, kind: "fee", amount_naira: -feeNaira, clears_at: new Date().toISOString(), note: "eventbuddy fee" }]
      : []),
  ];
  const { error } = await supabase.from("ledger_entries").upsert(rows, { onConflict: "transaction_id,kind", ignoreDuplicates: true });
  if (error) console.error(`[ledger] couldn't credit held sale ${txn.id} for org ${txn.organization_id} — needs manual posting:`, error.message);
  if (txn.referral_id) await postPromoterCommission(supabase, txn, feeNaira, clearsAt ?? new Date().toISOString());
}

/** A held sale that came through a promoter's link (migration 0105): moves
 *  their commission from the organizer's balance to the promoter's. Skipped
 *  when the event's program is off, the promoter is suspended, or the
 *  promoter bought the ticket for themselves (or put themselves in the group). */
async function postPromoterCommission(
  supabase: SupabaseClient,
  txn: { id: string; organization_id: string; event_id: string; amount_naira: number | string; referral_id?: string | null; registrant_data?: PendingTicketTxn["registrant_data"] },
  feeNaira: number,
  clearsAt: string
) {
  const { data: ref } = await supabase.from("event_referrals").select("promoter_id").eq("id", txn.referral_id!).maybeSingle();
  if (!ref?.promoter_id) return;
  const [{ data: promoter }, { data: event }] = await Promise.all([
    supabase.from("promoters").select("id, email, phone, is_suspended").eq("id", ref.promoter_id).maybeSingle(),
    supabase.from("events").select("promoter_program_enabled, promoter_commission_pct, promoter_commission_cap_naira").eq("id", txn.event_id).maybeSingle(),
  ]);
  if (!promoter || promoter.is_suspended || !event?.promoter_program_enabled) return;
  const info = txn.registrant_data;
  const emails = [info?.email, ...(info?.guests ?? []).map((g) => g.email)].filter(Boolean).map((e) => String(e).trim().toLowerCase());
  if (emails.includes(String(promoter.email).trim().toLowerCase())) return;
  // a promoter buying with another email but their own phone is still buying for themselves
  const digits = (p: unknown) => String(p ?? "").replace(/\D/g, "").slice(-10);
  const phones = [info?.phone, ...((info?.guests ?? []) as { phone?: string }[]).map((g) => g.phone)].map(digits).filter((p) => p.length === 10);
  if (promoter.phone && phones.includes(digits(promoter.phone))) return;

  const commission = promoterCommission({
    amountNaira: Number(txn.amount_naira),
    feeNaira,
    pct: Number(event.promoter_commission_pct),
    capNaira: event.promoter_commission_cap_naira == null ? null : Number(event.promoter_commission_cap_naira),
    people: 1 + (info?.guests?.length ?? 0),
  });
  if (!(commission > 0)) return;
  const base = { event_id: txn.event_id, transaction_id: txn.id, clears_at: clearsAt };
  const { error } = await supabase.from("ledger_entries").upsert(
    [
      { ...base, organization_id: txn.organization_id, promoter_id: null, kind: "commission", amount_naira: -commission, note: "Promoter commission" },
      { ...base, organization_id: null, promoter_id: promoter.id, kind: "commission_earned", amount_naira: commission, note: "Commission earned" },
    ],
    { onConflict: "transaction_id,kind", ignoreDuplicates: true }
  );
  if (error) console.error(`[ledger] couldn't post promoter commission on ${txn.id} — needs manual posting:`, error.message);
}

type PendingTicketTxn = {
  id: string;
  organization_id: string;
  event_id: string;
  ticket_type_id: string | null;
  discount_code_id: string | null;
  /** Set at checkout from the share link's ?ref=; copied onto the registration
   *  (or lead) this transaction materializes. See migration 0097. */
  referral_id?: string | null;
  registrant_data: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    customAnswers?: Record<string, string | string[]>;
    source?: "web" | "mobile";
    hideFromGuestList?: boolean;
    /** Group (bundle) tickets: the other people this purchase admits. */
    guests?: { firstName: string; lastName: string; email: string }[];
  } | null;
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
    .select("id, slug, name, date, start_time, end_time, event_format, virtual_join_url, virtual_platform, virtual_access_notes, venue, location")
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
      return buildHubUrl(siteUrl, org.slug, event!, hubToken);
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
      source: info.source === "mobile" ? "mobile" : "web",
      status: "registered",
      hide_from_guest_list: Boolean(info.hideFromGuestList),
      // A paid virtual ticket lands as a lead, not a registration, so the
      // referral has to be carried here too or virtual sales attribute to nobody.
      referral_id: txn.referral_id ?? null,
    });
    if (leadErr) {
      console.error(`[ticket-purchase] paid ticket for ${info.email} on event ${txn.event_id} succeeded but no lead could be created:`, leadErr.message);
      return { referenceId: null };
    }
    const virtualHub = await tryHubUrl(info.email, `${info.firstName} ${info.lastName}`);
    await sendVirtualConfirmationEmail(info.email, event, virtualHub);
    await sendPushToAttendee(supabase, info.email, "Payment confirmed! 🎉", `${event.name} — check your email for join details.`, { eventId: txn.event_id });
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
        source: info.source === "mobile" ? "mobile" : "web",
        hide_from_guest_list: Boolean(info.hideFromGuestList),
        // Carried over from the transaction: the referral was known at
        // checkout, but this registration only exists now that the payment
        // settled.
        referral_id: txn.referral_id ?? null,
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
  await sendPushToAttendee(supabase, info.email, "Payment confirmed! 🎉", `${event.name} — your ticket is ready.`, { eventId: txn.event_id, referenceId });

  // Group ticket: every guest the buyer named gets their own registration,
  // reference ID and QR (so each checks in independently), linked to the
  // buyer's row so a refund cancels the whole group. The bundle already
  // counted once against quantity_sold above. A guest that fails is logged and
  // skipped; it never undoes the buyer's paid ticket.
  for (const guest of info.guests ?? []) {
    let guestRef: string | null = null;
    let guestErr: { message: string; code?: string } | null = null;
    for (let attempt = 0; attempt < 5 && !guestRef; attempt++) {
      const candidate = generateReferenceId();
      const { data, error } = await supabase
        .from("registrations")
        .insert({
          organization_id: txn.organization_id,
          event_id: txn.event_id,
          ticket_type_id: txn.ticket_type_id,
          reference_id: candidate,
          full_name: `${guest.firstName} ${guest.lastName}`,
          email: guest.email,
          phone: null,
          custom_answers: {},
          source: info.source === "mobile" ? "mobile" : "web",
          hide_from_guest_list: Boolean(info.hideFromGuestList),
          referral_id: txn.referral_id ?? null,
          group_lead_id: registrationId,
        })
        .select("id")
        .single();
      if (data) guestRef = candidate;
      else {
        guestErr = error;
        if (error?.code !== "23505") break;
      }
    }
    if (!guestRef) {
      console.error(`[ticket-purchase] group ticket ${txn.id}: guest ${guest.email} couldn't be registered — needs manual follow-up:`, guestErr?.message);
      continue;
    }
    const guestHub = await tryHubUrl(guest.email, `${guest.firstName} ${guest.lastName}`);
    await sendRegistrationEmail(guest.email, guestRef, event, guestHub);
  }

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

/** Tells the attendee their money is back — sent only from the organizer-initiated
 *  self-service refund route (POST /api/orgs/[slug]/events/[eventId]/registrations/refund),
 *  never from handleRefundOrDispute itself: that function also runs for the webhook
 *  path (a refund/dispute Paystack tells us about after the fact, e.g. filed on
 *  Paystack's own dashboard), where a "your registration was refunded" email to an
 *  attendee who didn't request anything would be confusing without more context than
 *  this app has at that point. */
export async function sendAttendeeRefundEmail(to: string, eventName: string, amountNaira: number) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;

  const safeEvent = escapeHtml(eventName);
  const bodyHtml = `
    <h1 style="font-size:19px; margin:0 0 12px;">Your payment for ${safeEvent} has been refunded</h1>
    <p style="margin:0 0 20px; color:#666;">
      The organizer has refunded your ${escapeHtml(formatNaira(amountNaira))} ticket purchase for <strong>${safeEvent}</strong>.
      Your registration has been cancelled. The refund will reflect on your original payment method according to your bank's processing time.
    </p>
  `;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: `You've been refunded — ${eventName}`,
      text: `The organizer has refunded your ${formatNaira(amountNaira)} ticket purchase for ${eventName}. Your registration has been cancelled.`,
      html: renderEmailShell({ color: "#9a3412", label: "Refund", emoji: "💸" }, bodyHtml),
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
  // read before the update below changes it
  const priorStatus: string = txn.status;

  const { data: updated } = await supabase
    .from("paystack_transactions")
    .update({ status: kind })
    .eq("id", txn.id)
    .eq("status", txn.status)
    .select()
    .maybeSingle();
  if (!updated) return { handled: true };
  // a dispute later refunded (or the reverse) was already reversed once:
  // record the new status but don't debit, cancel or decrement again
  if (priorStatus === "refunded" || priorStatus === "disputed") return { handled: true };

  // a stand payment (0112) is refunded the same way: the booking is cancelled
  // and the money comes off the organizer's held balance below
  if (txn.purpose === "ticket_purchase" || txn.purpose === "stand_booking") {
    if (txn.exhibitor_id) {
      await supabase.from("exhibitors").update({ status: "cancelled" }).eq("id", txn.exhibitor_id);
    }
    if (txn.registration_id) {
      await supabase.from("registrations").update({ status: "cancelled" }).eq("id", txn.registration_id);
      // a group ticket's guests point at the buyer's row; the refund covers them too
      await supabase.from("registrations").update({ status: "cancelled" }).eq("group_lead_id", txn.registration_id);
    }
    if (txn.ticket_type_id) {
      await supabase.rpc("decrement_ticket_sold", { p_ticket_type_id: txn.ticket_type_id });
    }
    if (txn.discount_code_id) {
      await supabase.rpc("decrement_discount_uses", { p_discount_code_id: txn.discount_code_id });
    }
    // Held funds: the money came out of eventbuddy's balance, so it comes off
    // what the organizer is owed. eventbuddy's fee is not returned (Paystack
    // keeps its own charge on a refunded payment too). If they've already been
    // paid out, the balance goes negative and the next sale covers it first.
    if (txn.settlement === "held") {
      const { error } = await supabase.from("ledger_entries").upsert(
        {
          organization_id: txn.organization_id,
          event_id: txn.event_id,
          transaction_id: txn.id,
          kind: kind === "refunded" ? "refund" : "dispute",
          amount_naira: -Number(txn.amount_naira),
          note: kind === "refunded" ? "Ticket refunded" : "Payment disputed",
        },
        { onConflict: "transaction_id,kind", ignoreDuplicates: true }
      );
      if (error) console.error(`[ledger] couldn't debit ${kind} transaction ${txn.id} — needs manual posting:`, error.message);
      // A promoter's commission on it comes back to the organizer.
      const { data: earned } = await supabase.from("ledger_entries").select("promoter_id, amount_naira").eq("transaction_id", txn.id).eq("kind", "commission_earned").maybeSingle();
      if (earned) {
        const base = { event_id: txn.event_id, transaction_id: txn.id, clears_at: new Date().toISOString() };
        const { error: cErr } = await supabase.from("ledger_entries").upsert(
          [
            { ...base, organization_id: txn.organization_id, promoter_id: null, kind: "commission_refund", amount_naira: Number(earned.amount_naira), note: "Promoter commission returned" },
            { ...base, organization_id: null, promoter_id: earned.promoter_id, kind: "commission_reversal", amount_naira: -Number(earned.amount_naira), note: kind === "refunded" ? "Ticket refunded" : "Payment disputed" },
          ],
          { onConflict: "transaction_id,kind", ignoreDuplicates: true }
        );
        if (cErr) console.error(`[ledger] couldn't reverse promoter commission on ${txn.id}:`, cErr.message);
      }
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
