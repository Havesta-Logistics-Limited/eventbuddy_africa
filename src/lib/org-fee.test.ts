import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "./test-utils/fake-supabase";
import { customTicketFee, organizerTicketFee } from "./org-fee";

/** Precedence of an organizer's fee (migration 0126): exempt > custom > plan > default. */

function seed(org: Record<string, unknown>, planId = "launch") {
  const s = createFakeSupabase({
    organizations: [{ id: "o1", is_fee_exempt: false, custom_fee_percentage: null, custom_fee_flat_naira: null, ...org }],
    platform_settings: [{ id: true, ticket_fee_percentage: 5, ticket_fee_flat_naira: 100 }],
    organizer_plans: [
      { id: "launch", fee_percentage: null, fee_flat_naira: null },
      { id: "grow", fee_percentage: 3, fee_flat_naira: 100 },
    ],
  });
  s.setRpc("effective_plan_id", () => planId);
  return s;
}

describe("organizerTicketFee", () => {
  it("uses the platform default with no plan rate or custom rate", async () => {
    expect(await organizerTicketFee(seed({}), "o1")).toEqual({ fee: { percentage: 5, flatNaira: 100 }, source: "default", planId: "launch" });
  });

  it("uses the plan's rate", async () => {
    expect(await organizerTicketFee(seed({}, "grow"), "o1")).toMatchObject({ fee: { percentage: 3, flatNaira: 100 }, source: "plan" });
  });

  it("a custom agreed rate beats the plan", async () => {
    const r = await organizerTicketFee(seed({ custom_fee_percentage: 2.5, custom_fee_flat_naira: 50 }, "grow"), "o1");
    expect(r).toMatchObject({ fee: { percentage: 2.5, flatNaira: 50 }, source: "custom" });
  });

  it("a custom rate of 0% + ₦0 is honoured, not treated as unset", async () => {
    expect(await organizerTicketFee(seed({ custom_fee_percentage: 0, custom_fee_flat_naira: 0 }), "o1")).toMatchObject({ fee: { percentage: 0, flatNaira: 0 }, source: "custom" });
  });

  it("fee-exempt beats everything", async () => {
    const r = await organizerTicketFee(seed({ is_fee_exempt: true, custom_fee_percentage: 2.5, custom_fee_flat_naira: 50 }), "o1");
    expect(r).toMatchObject({ fee: { percentage: 0, flatNaira: 0 }, source: "exempt" });
  });
});

describe("customTicketFee", () => {
  it("is null unless both parts are set", () => {
    expect(customTicketFee({ custom_fee_percentage: 3, custom_fee_flat_naira: null })).toBeNull();
    expect(customTicketFee({ custom_fee_percentage: "3.00", custom_fee_flat_naira: "50.00" })).toEqual({ percentage: 3, flatNaira: 50 });
  });
});
