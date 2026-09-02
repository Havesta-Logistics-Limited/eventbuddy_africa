import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "./test-utils/fake-supabase";
import { finalizePaystackTransaction } from "./paystack";

/**
 * Smoke tests around the one path where a silent regression costs real
 * money: verifying and fulfilling a Paystack payment. Uses an in-memory fake
 * Supabase client (see test-utils/fake-supabase.ts) and a mocked fetch for
 * Paystack's own verify endpoint, so these run with no network and no live
 * database — exactly the coverage gap the infrastructure audit flagged.
 */

const CHARGE_AMOUNT_MINOR = 500000; // ₦5,000 in kobo

function mockPaystackVerify(response: { status: string; amount: number; currency: string }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: true, message: "ok", data: { status: response.status, reference: "ref", amount: response.amount, currency: response.currency, metadata: {} } }),
    }))
  );
}

beforeEach(() => {
  process.env.PAYSTACK_SECRET_KEY = "sk_test_fake_for_unit_tests";
  // Deliberately unset so sendRegistrationEmail/sendVirtualConfirmationEmail
  // short-circuit to `false` immediately without needing a real Resend key —
  // exactly the same guard those functions use in production.
  delete process.env.RESEND_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("finalizePaystackTransaction", () => {
  it("returns unknown_reference when no transaction matches", async () => {
    const supabase = createFakeSupabase({ paystack_transactions: [] });
    const result = await finalizePaystackTransaction(supabase, "does-not-exist");
    expect(result).toEqual({ ok: false, reason: "unknown_reference" });
  });

  it("marks the transaction failed and returns payment_failed when Paystack reports the charge didn't succeed", async () => {
    mockPaystackVerify({ status: "abandoned", amount: CHARGE_AMOUNT_MINOR, currency: "NGN" });
    const supabase = createFakeSupabase({
      paystack_transactions: [
        { id: "t1", reference: "ref-1", status: "pending", purpose: "ticket_purchase", event_id: "e1", organization_id: "o1", charge_currency: "NGN", charge_amount_minor: CHARGE_AMOUNT_MINOR },
      ],
    });
    const result = await finalizePaystackTransaction(supabase, "ref-1");
    expect(result).toEqual({ ok: false, reason: "payment_failed" });
    expect(supabase.db.paystack_transactions[0].status).toBe("failed");
  });

  it("refuses a short payment (amount_mismatch) even if Paystack reports success", async () => {
    mockPaystackVerify({ status: "success", amount: CHARGE_AMOUNT_MINOR - 1, currency: "NGN" });
    const supabase = createFakeSupabase({
      paystack_transactions: [
        { id: "t1", reference: "ref-1", status: "pending", purpose: "ticket_purchase", event_id: "e1", organization_id: "o1", charge_currency: "NGN", charge_amount_minor: CHARGE_AMOUNT_MINOR },
      ],
    });
    const result = await finalizePaystackTransaction(supabase, "ref-1");
    expect(result).toEqual({ ok: false, reason: "amount_mismatch" });
    expect(supabase.db.paystack_transactions[0].status).toBe("failed");
  });

  it("treats a non-ticket_purchase transaction (a historical event-publish row) as an inert, already-settled record", async () => {
    const supabase = createFakeSupabase({
      paystack_transactions: [
        { id: "t1", reference: "ref-1", status: "pending", purpose: "event_publish", event_id: "e1", organization_id: "o1", charge_currency: "NGN", charge_amount_minor: CHARGE_AMOUNT_MINOR },
      ],
      events: [{ id: "e1", published: false, payment_status: "pending" }],
    });
    const result = await finalizePaystackTransaction(supabase, "ref-1");
    expect(result).toEqual({ ok: true, purpose: "other", eventId: "e1", alreadyProcessed: true });
    // The flat event-publish fee was scrapped (migration 0045) — this must never
    // touch the events table anymore, regardless of the transaction's status.
    expect(supabase.db.events[0].published).toBe(false);
    expect(supabase.db.events[0].payment_status).toBe("pending");
  });

  it("creates a real registration (with a reference ID) for a successful physical ticket purchase", async () => {
    mockPaystackVerify({ status: "success", amount: CHARGE_AMOUNT_MINOR, currency: "NGN" });
    const supabase = createFakeSupabase({
      paystack_transactions: [
        {
          id: "t1",
          reference: "ref-1",
          status: "pending",
          purpose: "ticket_purchase",
          event_id: "e1",
          organization_id: "o1",
          ticket_type_id: "tt1",
          discount_code_id: null,
          charge_currency: "NGN",
          charge_amount_minor: CHARGE_AMOUNT_MINOR,
          registrant_data: { firstName: "Amaka", lastName: "Obi", email: "amaka@example.com", phone: null },
        },
      ],
      events: [{ id: "e1", event_format: "physical", name: "Test Event" }],
      organizations: [{ id: "o1", slug: "test-org" }],
      ticket_types: [{ id: "tt1", quantity_sold: 0, quantity_available: 10 }],
    });
    supabase.setRpc("increment_ticket_sold", () => true);

    const result = await finalizePaystackTransaction(supabase, "ref-1");

    expect(result.ok).toBe(true);
    if (result.ok && result.purpose === "ticket_purchase") {
      expect(result.referenceId).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(result.alreadyProcessed).toBe(false);
    }
    expect(supabase.db.registrations).toHaveLength(1);
    expect(supabase.db.registrations[0]).toMatchObject({ email: "amaka@example.com", full_name: "Amaka Obi" });
    // The transaction is linked back to the exact registration it created —
    // what a later refund/dispute (handleRefundOrDispute) relies on to find
    // and cancel the right row.
    expect(supabase.db.paystack_transactions[0].registration_id).toBe(supabase.db.registrations[0].id);
  });

  it("never creates a second registration when called twice for the same reference (idempotency)", async () => {
    mockPaystackVerify({ status: "success", amount: CHARGE_AMOUNT_MINOR, currency: "NGN" });
    const supabase = createFakeSupabase({
      paystack_transactions: [
        {
          id: "t1",
          reference: "ref-1",
          status: "pending",
          purpose: "ticket_purchase",
          event_id: "e1",
          organization_id: "o1",
          ticket_type_id: null,
          discount_code_id: null,
          charge_currency: "NGN",
          charge_amount_minor: CHARGE_AMOUNT_MINOR,
          registrant_data: { firstName: "Amaka", lastName: "Obi", email: "amaka@example.com", phone: null },
        },
      ],
      events: [{ id: "e1", event_format: "physical", name: "Test Event" }],
      organizations: [{ id: "o1", slug: "test-org" }],
    });

    const first = await finalizePaystackTransaction(supabase, "ref-1");
    const second = await finalizePaystackTransaction(supabase, "ref-1");

    expect(supabase.db.registrations).toHaveLength(1);
    expect(second.ok).toBe(true);
    if (second.ok && second.purpose === "ticket_purchase" && first.ok && first.purpose === "ticket_purchase") {
      expect(second.alreadyProcessed).toBe(true);
      expect(second.referenceId).toBe(first.referenceId);
    }
  });
});
