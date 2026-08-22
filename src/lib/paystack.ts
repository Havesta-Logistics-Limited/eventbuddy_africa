import type { SupabaseClient } from "@supabase/supabase-js";

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
 * price shown anywhere) is denominated in USD, but this Paystack account only accepts
 * NGN — confirmed directly against the Paystack API (a USD initialize call returns
 * "unsupported_currency"). So the amount actually charged is the USD price converted
 * to Naira at a manually-configured rate, not a live feed. USD_TO_NGN_RATE must be
 * kept reasonably current in .env.local — a stale rate either overcharges or
 * undercharges an organization relative to the advertised USD price. PAYSTACK_CURRENCY
 * defaults to NGN (what this account actually supports); override it only if a
 * different Paystack account with USD (or another currency) enabled is ever used.
 */
export function convertUsdToChargeAmount(amountUsd: number): { currency: string; amountMinor: number } {
  const currency = (process.env.PAYSTACK_CURRENCY || "NGN").toUpperCase();
  if (currency === "USD") {
    return { currency, amountMinor: Math.round(amountUsd * 100) };
  }
  const rate = Number(process.env.USD_TO_NGN_RATE);
  if (!(rate > 0)) {
    throw new Error(`Payments aren't configured yet. Add a real USD_TO_NGN_RATE to .env.local (charging in ${currency}).`);
  }
  return { currency, amountMinor: Math.round(amountUsd * rate * 100) };
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
    }),
  });
  const json = (await res.json()) as PaystackInitializeResponse;
  if (!res.ok || !json.status || !json.data) {
    throw new Error(json.message || "Couldn't start payment. Please try again.");
  }
  return { authorizationUrl: json.data.authorization_url, accessCode: json.data.access_code };
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
  | { ok: true; eventId: string; alreadyProcessed: boolean }
  | { ok: false; reason: "unknown_reference" | "payment_failed" | "amount_mismatch" | "verify_error" };

/**
 * The single place both the webhook and the post-checkout callback page call to
 * actually mark a payment as done — idempotent by design, since Paystack can (and
 * does) deliver the webhook more than once, and a user's browser redirect back can
 * race with it. Safe to call concurrently or repeatedly for the same reference: only
 * the first caller to see status still 'pending' does anything; every other caller
 * (including a genuine retry) gets alreadyProcessed: true and touches nothing.
 */
export async function finalizePaystackTransaction(supabase: SupabaseClient, reference: string): Promise<FinalizeResult> {
  const { data: txn } = await supabase.from("paystack_transactions").select("*").eq("reference", reference).maybeSingle();
  if (!txn) return { ok: false, reason: "unknown_reference" };
  if (txn.status === "success") return { ok: true, eventId: txn.event_id, alreadyProcessed: true };

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

  // Refuse to publish for less than it actually costs — compares against the exact
  // integer amount recorded at initialize time (charge_amount_minor), never
  // recomputed from amount_usd/an exchange rate, so a rate change or tampered/replayed
  // reference can't slip a short payment through.
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

  if (!updated) return { ok: true, eventId: txn.event_id, alreadyProcessed: true };

  await supabase.from("events").update({ published: true, payment_status: "paid" }).eq("id", txn.event_id);
  return { ok: true, eventId: txn.event_id, alreadyProcessed: false };
}
