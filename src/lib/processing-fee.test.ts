import { describe, expect, it } from "vitest";
import { DEFAULT_PROCESSING_FEE, processingFeeNaira } from "./billing";

// what Paystack takes from a charge, in kobo (1.5% + ₦100, ₦100 waived below ₦2,500, capped ₦2,000)
const paystackTakes = (chargeKobo: number) => Math.min(0.015 * chargeKobo + (chargeKobo >= 250_000 ? 10_000 : 0), 200_000);

describe("processingFeeNaira", () => {
  it.each([
    [8000, 224],
    [10000, 254],
    [37500, 673],
    [75000, 1244],
    [500000, 2000],
    [1000, 16],
    [2450, 38],
  ])("₦%i ticket → ₦%i processing", (price, fee) => {
    expect(processingFeeNaira(price, DEFAULT_PROCESSING_FEE)).toBe(fee);
  });

  it("always leaves at least the ticket price after Paystack's cut", () => {
    for (let price = 100; price <= 300_000; price += 137) {
      const charge = (price + processingFeeNaira(price, DEFAULT_PROCESSING_FEE)) * 100;
      expect(charge - paystackTakes(charge)).toBeGreaterThanOrEqual(price * 100);
    }
  });

  it("is zero when switched off or free", () => {
    expect(processingFeeNaira(8000, { ...DEFAULT_PROCESSING_FEE, enabled: false })).toBe(0);
    expect(processingFeeNaira(0, DEFAULT_PROCESSING_FEE)).toBe(0);
  });
});
