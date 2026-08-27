import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFakeSupabase } from "./test-utils/fake-supabase";
import { handleRefundOrDispute } from "./paystack";

/**
 * Covers the concurrency bug the second infrastructure audit found: two
 * concurrent calls for the same reference (a redelivered webhook racing a
 * manual-refund click) must decrement capacity exactly once, not twice. See
 * the status-transition UPDATE (`.eq("status", txn.status)`) in
 * handleRefundOrDispute — this is the guard these tests exist to protect.
 */

beforeEach(() => {
  delete process.env.RESEND_API_KEY;
});

afterEach(() => {
  // no-op, kept for symmetry with paystack.finalize.test.ts
});

describe("handleRefundOrDispute", () => {
  it("returns handled: false when no transaction matches the reference", async () => {
    const supabase = createFakeSupabase({ paystack_transactions: [] });
    const result = await handleRefundOrDispute(supabase, "does-not-exist", "refunded");
    expect(result).toEqual({ handled: false });
  });

  it("cancels the registration and decrements capacity exactly once, even when called twice for the same reference", async () => {
    const supabase = createFakeSupabase({
      paystack_transactions: [
        {
          id: "t1",
          reference: "ref-1",
          status: "success",
          purpose: "ticket_purchase",
          registration_id: "r1",
          ticket_type_id: "tt1",
          discount_code_id: "dc1",
          organization_id: "o1",
          event_id: "e1",
          amount_naira: 500,
        },
      ],
      registrations: [{ id: "r1", status: "confirmed" }],
    });
    let decrementTicketCalls = 0;
    let decrementDiscountCalls = 0;
    supabase.setRpc("decrement_ticket_sold", () => {
      decrementTicketCalls += 1;
      return true;
    });
    supabase.setRpc("decrement_discount_uses", () => {
      decrementDiscountCalls += 1;
      return true;
    });

    const first = await handleRefundOrDispute(supabase, "ref-1", "refunded");
    const second = await handleRefundOrDispute(supabase, "ref-1", "refunded");

    expect(first).toEqual({ handled: true });
    expect(second).toEqual({ handled: true });
    expect(decrementTicketCalls).toBe(1);
    expect(decrementDiscountCalls).toBe(1);
    expect(supabase.db.registrations[0].status).toBe("cancelled");
    expect(supabase.db.paystack_transactions[0].status).toBe("refunded");
  });

  it("simulates a race: two callers both read success before either writes — only the first write wins", async () => {
    const supabase = createFakeSupabase({
      paystack_transactions: [
        {
          id: "t1",
          reference: "ref-1",
          status: "success",
          purpose: "ticket_purchase",
          registration_id: "r1",
          ticket_type_id: "tt1",
          discount_code_id: null,
          organization_id: "o1",
          event_id: "e1",
          amount_naira: 500,
        },
      ],
      registrations: [{ id: "r1", status: "confirmed" }],
    });

    // Both "callers" read the row (status still "success") before either
    // writes, exactly the interleaving that produced the double-decrement bug.
    // The fake client returns live references into its in-memory table, not
    // copies, so the status is captured into a primitive immediately after
    // each read — otherwise both "reads" would observe write1's mutation
    // through the shared object reference, defeating the point of the test.
    const statusAtRead1: unknown = (await supabase.from("paystack_transactions").select("*").eq("reference", "ref-1").maybeSingle()).data.status;
    const statusAtRead2: unknown = (await supabase.from("paystack_transactions").select("*").eq("reference", "ref-1").maybeSingle()).data.status;
    expect(statusAtRead1).toBe("success");
    expect(statusAtRead2).toBe("success");

    const write1 = await supabase.from("paystack_transactions").update({ status: "refunded" }).eq("id", "t1").eq("status", statusAtRead1).select().maybeSingle();
    const write2 = await supabase.from("paystack_transactions").update({ status: "refunded" }).eq("id", "t1").eq("status", statusAtRead2).select().maybeSingle();

    expect(write1.data).not.toBeNull();
    expect(write2.data).toBeNull();
  });

  it("is a no-op when the transaction is already in the target status", async () => {
    const supabase = createFakeSupabase({
      paystack_transactions: [{ id: "t1", reference: "ref-1", status: "refunded", purpose: "ticket_purchase", registration_id: "r1", organization_id: "o1", event_id: "e1", amount_naira: 500 }],
      registrations: [{ id: "r1", status: "cancelled" }],
    });
    let decrementTicketCalls = 0;
    supabase.setRpc("decrement_ticket_sold", () => {
      decrementTicketCalls += 1;
      return true;
    });

    const result = await handleRefundOrDispute(supabase, "ref-1", "refunded");

    expect(result).toEqual({ handled: true });
    expect(decrementTicketCalls).toBe(0);
  });

  it("unpublishes the event and resets payment_status on an event_publish refund", async () => {
    const supabase = createFakeSupabase({
      paystack_transactions: [{ id: "t1", reference: "ref-2", status: "success", purpose: "event_publish", organization_id: "o1", event_id: "e1", amount_naira: 5000 }],
      events: [{ id: "e1", published: true, payment_status: "paid" }],
    });

    const result = await handleRefundOrDispute(supabase, "ref-2", "disputed");

    expect(result).toEqual({ handled: true });
    expect(supabase.db.events[0].published).toBe(false);
    expect(supabase.db.events[0].payment_status).toBe("pending");
    expect(supabase.db.paystack_transactions[0].status).toBe("disputed");
  });
});
