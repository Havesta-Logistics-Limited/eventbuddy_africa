import { describe, expect, it } from "vitest";
import { nairaToChargeAmount } from "./paystack";

describe("nairaToChargeAmount", () => {
  it("converts Naira to kobo (×100), the exact amount actually sent to Paystack", () => {
    expect(nairaToChargeAmount(1000)).toEqual({ currency: "NGN", amountMinor: 100000 });
  });

  it("rounds fractional Naira to the nearest kobo rather than truncating or throwing", () => {
    expect(nairaToChargeAmount(99.999)).toEqual({ currency: "NGN", amountMinor: 10000 });
  });

  it("handles zero (a fully-discounted free ticket)", () => {
    expect(nairaToChargeAmount(0)).toEqual({ currency: "NGN", amountMinor: 0 });
  });
});
