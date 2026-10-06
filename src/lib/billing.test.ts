import { describe, expect, it } from "vitest";
import { applyDiscount, formatNaira, formatTicketFee, ticketFeeFromSettings, ticketFeeMinor, planTicketFee } from "./billing";

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

describe("ticketFeeMinor (5% + ₦100 model)", () => {
  const fee = { percentage: 5, flatNaira: 100 };

  it("charges the percentage of the price paid plus the flat amount, in kobo", () => {
    // ₦10,000 ticket: ₦500 + ₦100 = ₦600
    expect(ticketFeeMinor(10000, fee)).toBe(60000);
  });

  it("computes on the discounted price actually paid", () => {
    // ₦8,000 after a discount: ₦400 + ₦100 = ₦500
    expect(ticketFeeMinor(8000, fee)).toBe(50000);
  });

  it("rounds the percentage part to the nearest kobo", () => {
    // ₦1,234.50 → 5% = ₦61.725 → 6173 kobo, + 10000
    expect(ticketFeeMinor(1234.5, fee)).toBe(16173);
  });

  it("never exceeds the payment itself", () => {
    // ₦100 ticket: ₦5 + ₦100 = ₦105 would be more than was paid
    expect(ticketFeeMinor(100, fee)).toBe(10000);
  });

  it("charges nothing on a free ticket", () => {
    expect(ticketFeeMinor(0, fee)).toBe(0);
  });

  it("supports a percentage-only fee when the flat amount is zero", () => {
    expect(ticketFeeMinor(10000, { percentage: 5, flatNaira: 0 })).toBe(50000);
  });
});

describe("formatTicketFee", () => {
  it("shows both parts", () => {
    expect(formatTicketFee({ percentage: 5, flatNaira: 100 })).toBe("5% + ₦100");
  });

  it("drops the flat part when it is zero", () => {
    expect(formatTicketFee({ percentage: 5, flatNaira: 0 })).toBe("5%");
  });

  it("keeps a fractional percentage readable", () => {
    expect(formatTicketFee({ percentage: 3.5, flatNaira: 50 })).toBe("3.5% + ₦50");
  });
});

describe("ticketFeeFromSettings", () => {
  it("reads both columns", () => {
    expect(ticketFeeFromSettings({ ticket_fee_percentage: "4.00", ticket_fee_flat_naira: "150.00" })).toEqual({ percentage: 4, flatNaira: 150 });
  });

  it("falls back to 5% + ₦100 when the row is missing", () => {
    expect(ticketFeeFromSettings(null)).toEqual({ percentage: 5, flatNaira: 100 });
  });

  it("falls back on the flat part for a row from before migration 0098", () => {
    expect(ticketFeeFromSettings({ ticket_fee_percentage: "5.00" })).toEqual({ percentage: 5, flatNaira: 100 });
  });

  it("respects an explicit zero flat amount", () => {
    expect(ticketFeeFromSettings({ ticket_fee_percentage: 5, ticket_fee_flat_naira: 0 })).toEqual({ percentage: 5, flatNaira: 0 });
  });
});

describe("ticketFeeMinor for group tickets", () => {
  const fee = { percentage: 5, flatNaira: 100 };
  it("charges the flat part once per person admitted", () => {
    // ₦40,000 bundle for 4: 5% = ₦2,000, plus ₦100 × 4 = ₦400 → ₦2,400
    expect(ticketFeeMinor(40000, fee, 4)).toBe(240000);
  });
  it("matches four single tickets of the same total", () => {
    expect(ticketFeeMinor(40000, fee, 4)).toBe(ticketFeeMinor(10000, fee) * 4);
  });
  it("treats a bad head count as one person", () => {
    expect(ticketFeeMinor(10000, fee, 0)).toBe(60000);
  });
  it("still never exceeds the payment", () => {
    expect(ticketFeeMinor(300, fee, 4)).toBe(30000);
  });
});

describe("planTicketFee", () => {
  const platform = { percentage: 5, flatNaira: 100 };
  it("uses the platform default when the plan has no fee (Launch)", () => {
    expect(planTicketFee({ fee_percentage: null, fee_flat_naira: null }, platform)).toEqual(platform);
    expect(planTicketFee(null, platform)).toEqual(platform);
  });
  it("uses the plan's own fee", () => {
    expect(planTicketFee({ fee_percentage: "3.00", fee_flat_naira: "100.00" }, platform)).toEqual({ percentage: 3, flatNaira: 100 });
  });
  it("allows a zero flat fee", () => {
    expect(planTicketFee({ fee_percentage: 4, fee_flat_naira: 0 }, platform)).toEqual({ percentage: 4, flatNaira: 0 });
  });
});

