import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "./test-utils/fake-supabase";
import { finalizePaystackTransaction } from "./paystack";

/**
 * International card fee (migration 0135): the buyer's processing fee is sized
 * for a local card; when Paystack charged more, the gap comes off the
 * organizer's share as a card_fee entry, so eventbuddy's fee stays whole.
 */

const CHARGE = 822400; // ₦8,000 ticket + ₦224 processing, in kobo

function mockVerify(feesKobo: number, country: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        status: true,
        message: "ok",
        data: { status: "success", reference: "ref-c", amount: CHARGE, currency: "NGN", metadata: {}, fees: feesKobo, authorization: { country_code: country } },
      }),
    }))
  );
}

function heldSale() {
  const supabase = createFakeSupabase({
    paystack_transactions: [
      {
        id: "t1",
        reference: "ref-c",
        status: "pending",
        purpose: "ticket_purchase",
        settlement: "held",
        event_id: "e1",
        organization_id: "o1",
        ticket_type_id: "tt1",
        discount_code_id: null,
        amount_naira: 8000,
        processing_fee_naira: 224,
        platform_fee_naira: 500,
        charge_currency: "NGN",
        charge_amount_minor: CHARGE,
        registrant_data: { firstName: "Ada", lastName: "Obi", email: "ada@example.com", phone: null },
      },
    ],
    events: [{ id: "e1", event_format: "physical", name: "Test Event" }],
    organizations: [{ id: "o1", slug: "test-org" }],
    ticket_types: [{ id: "tt1", quantity_sold: 0, quantity_available: 10 }],
    ledger_entries: [],
  });
  supabase.setRpc("increment_ticket_sold", () => true);
  supabase.setRpc("ledger_clear_time", () => new Date().toISOString());
  supabase.setRpc("record_sale_risk", () => null);
  return supabase;
}

beforeEach(() => {
  process.env.PAYSTACK_SECRET_KEY = "sk_test_fake_for_unit_tests";
  delete process.env.RESEND_API_KEY;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("international card fee", () => {
  it("takes the gap off the organizer's share when Paystack charged more than the processing fee", async () => {
    mockVerify(42073, "US"); // ₦420.73 at the international rate
    const supabase = heldSale();
    const result = await finalizePaystackTransaction(supabase, "ref-c");
    expect(result.ok).toBe(true);
    const entry = supabase.db.ledger_entries.find((r: Record<string, unknown>) => r.kind === "card_fee");
    expect(entry).toMatchObject({ organization_id: "o1", transaction_id: "t1", amount_naira: -196.73 });
    expect(String(entry.note)).toContain("US card");
    // eventbuddy's fee entry is untouched
    expect(supabase.db.ledger_entries.find((r: Record<string, unknown>) => r.kind === "fee")).toMatchObject({ amount_naira: -500 });
    expect(Number(supabase.db.paystack_transactions[0].net_amount_naira)).toBeCloseTo(8000 - 500 - 196.73, 2);
  });

  it("does nothing for a local card the processing fee covered", async () => {
    mockVerify(22336, "NG");
    const supabase = heldSale();
    await finalizePaystackTransaction(supabase, "ref-c");
    expect(supabase.db.ledger_entries.some((r: Record<string, unknown>) => r.kind === "card_fee")).toBe(false);
    expect(Number(supabase.db.paystack_transactions[0].net_amount_naira)).toBe(7500);
  });
});
