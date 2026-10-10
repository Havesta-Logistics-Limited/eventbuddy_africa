import { beforeEach, describe, expect, it } from "vitest";
import { createFakeSupabase } from "./test-utils/fake-supabase";
import { handleRefundOrDispute } from "./paystack";
import { recordPlatformRefund } from "./platform-refund";

/**
 * A platform admin refund of a held ₦1,000 ticket sold through a promoter
 * (₦150 eventbuddy fee, ₦42.50 commission), after Paystack has reversed the
 * charge. "eventbuddy carries it" must leave the organizer exactly where they
 * were; "the organizer carries it" takes the refund off their balance.
 */

const balance = (rows: Record<string, unknown>[], who: "org" | "promoter") =>
  rows.filter((r) => (who === "org" ? !r.promoter_id : r.promoter_id)).reduce((s, r) => s + Number(r.amount_naira), 0);

function seed() {
  return createFakeSupabase({
    paystack_transactions: [
      { id: "t1", reference: "ref-1", status: "success", purpose: "ticket_purchase", settlement: "held", registration_id: "r1", ticket_type_id: "tt1", organization_id: "o1", event_id: "e1", amount_naira: 1000 },
    ],
    registrations: [{ id: "r1", status: "checked_in" }],
    organizations: [{ id: "o1", email: null }],
    ledger_entries: [
      { id: "l1", organization_id: "o1", promoter_id: null, transaction_id: "t1", kind: "sale", amount_naira: 1000 },
      { id: "l2", organization_id: "o1", promoter_id: null, transaction_id: "t1", kind: "fee", amount_naira: -150 },
      { id: "l3", organization_id: "o1", promoter_id: null, transaction_id: "t1", kind: "commission", amount_naira: -42.5 },
      { id: "l4", organization_id: null, promoter_id: "p1", transaction_id: "t1", kind: "commission_earned", amount_naira: 42.5 },
    ],
  });
}

beforeEach(() => {
  delete process.env.RESEND_API_KEY;
});

describe("recordPlatformRefund", () => {
  it("eventbuddy carries it: the organizer's balance is unchanged, the promoter's commission is reversed", async () => {
    const supabase = seed();
    const before = balance(supabase.db.ledger_entries, "org");
    await handleRefundOrDispute(supabase, "ref-1", "refunded");
    const credit = await recordPlatformRefund(supabase, supabase.db.paystack_transactions[0], "eventbuddy", "Event cancelled", "admin-1");

    expect(credit).toBe(957.5);
    expect(balance(supabase.db.ledger_entries, "org")).toBeCloseTo(before);
    expect(balance(supabase.db.ledger_entries, "promoter")).toBeCloseTo(0);
    expect(supabase.db.registrations[0].status).toBe("cancelled");
    const refundLine = supabase.db.ledger_entries.find((r: Record<string, unknown>) => r.kind === "refund");
    expect(refundLine.note).toBe("Refunded by eventbuddy: Event cancelled");
    expect(refundLine.created_by).toBe("admin-1");
  });

  it("the organizer carries it: the refund less the returned commission comes off their balance", async () => {
    const supabase = seed();
    const before = balance(supabase.db.ledger_entries, "org");
    await handleRefundOrDispute(supabase, "ref-1", "refunded");
    const credit = await recordPlatformRefund(supabase, supabase.db.paystack_transactions[0], "organizer", "Buyer charged twice", "admin-1");

    expect(credit).toBe(0);
    expect(balance(supabase.db.ledger_entries, "org")).toBeCloseTo(before - 1000 + 42.5);
    expect(supabase.db.ledger_entries.some((r: Record<string, unknown>) => r.kind === "adjustment")).toBe(false);
  });

  it("credits only once when called twice", async () => {
    const supabase = seed();
    await handleRefundOrDispute(supabase, "ref-1", "refunded");
    await recordPlatformRefund(supabase, supabase.db.paystack_transactions[0], "eventbuddy", "x", "admin-1");
    await recordPlatformRefund(supabase, supabase.db.paystack_transactions[0], "eventbuddy", "x", "admin-1");
    expect(supabase.db.ledger_entries.filter((r: Record<string, unknown>) => r.kind === "adjustment")).toHaveLength(1);
  });

  it("does nothing to the ledger for a sale that went straight to the organizer's bank", async () => {
    const supabase = seed();
    supabase.db.paystack_transactions[0].settlement = "split";
    const rowsBefore = supabase.db.ledger_entries.length;
    const credit = await recordPlatformRefund(supabase, supabase.db.paystack_transactions[0], "eventbuddy", "x", "admin-1");
    expect(credit).toBe(0);
    expect(supabase.db.ledger_entries).toHaveLength(rowsBefore);
  });
});
