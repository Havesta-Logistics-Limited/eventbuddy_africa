import { describe, expect, it } from "vitest";
import { applyDiscount, formatNaira } from "./billing";

describe("applyDiscount", () => {
  it("applies a percentage discount", () => {
    expect(applyDiscount(10000, "percentage", 20)).toBe(8000);
  });

  it("applies a fixed discount", () => {
    expect(applyDiscount(10000, "fixed", 3000)).toBe(7000);
  });

  it("clamps a fixed discount larger than the price to free, never negative", () => {
    expect(applyDiscount(5000, "fixed", 20000)).toBe(0);
  });

  it("caps a percentage discount at maxDiscountNaira when set", () => {
    // 50% of 10000 = 5000, but capped at 1000.
    expect(applyDiscount(10000, "percentage", 50, 1000)).toBe(9000);
  });

  it("ignores the cap when the actual discount is already smaller than it", () => {
    expect(applyDiscount(10000, "percentage", 10, 5000)).toBe(9000);
  });

  it("rounds to the nearest whole Naira", () => {
    expect(applyDiscount(1000, "percentage", 33)).toBe(670);
  });
});

describe("formatNaira", () => {
  it("formats with the currency symbol and thousands separators", () => {
    expect(formatNaira(74985)).toBe("₦74,985");
  });

  it("rounds fractional amounts", () => {
    expect(formatNaira(999.6)).toBe("₦1,000");
  });
});
