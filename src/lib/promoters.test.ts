import { describe, expect, it } from "vitest";
import { promoterCommission, promoterLink, validateHandle } from "./promoters";

describe("promoterCommission", () => {
  it("is a % of the organizer's net after eventbuddy's fee", () => {
    // ₦20,000 ticket, ₦1,100 fee → net ₦18,900; 10% → ₦1,890
    expect(promoterCommission({ amountNaira: 20000, feeNaira: 1100, pct: 10, capNaira: null, people: 1 })).toBe(1890);
  });
  it("respects the cap per ticket", () => {
    expect(promoterCommission({ amountNaira: 20000, feeNaira: 1100, pct: 10, capNaira: 1000, people: 1 })).toBe(1000);
  });
  it("scales the cap by the people a group ticket admits", () => {
    // ₦80,000 for 4, fee ₦4,400 → net ₦75,600; 10% = ₦7,560; cap 4 × ₦1,500 = ₦6,000
    expect(promoterCommission({ amountNaira: 80000, feeNaira: 4400, pct: 10, capNaira: 1500, people: 4 })).toBe(6000);
  });
  it("never goes negative and rounds to kobo", () => {
    expect(promoterCommission({ amountNaira: 100, feeNaira: 200, pct: 10, capNaira: null, people: 1 })).toBe(0);
    expect(promoterCommission({ amountNaira: 1000, feeNaira: 333, pct: 7.5, capNaira: null, people: 1 })).toBe(50.03);
  });
});

describe("validateHandle", () => {
  it("normalises @ and case", () => {
    expect(validateHandle("@King_Jesse")).toEqual({ ok: true, handle: "king_jesse" });
  });
  it("rejects bad characters, length and reserved words", () => {
    expect(validateHandle("ab").ok).toBe(false);
    expect(validateHandle("king jesse").ok).toBe(false);
    expect(validateHandle("events").ok).toBe(false);
  });
});

describe("promoterLink", () => {
  it("uses the short form when the event has a custom link", () => {
    expect(promoterLink("https://eventbuddy.africa/", { slug: "wizkid-lagos", orgSlug: "o", eventId: "e" }, "kingjesse")).toBe("https://eventbuddy.africa/wizkid-lagos/kingjesse");
  });
  it("falls back to the register page with ?ref=", () => {
    expect(promoterLink("https://eventbuddy.africa", { slug: null, orgSlug: "acme", eventId: "123" }, "kingjesse")).toBe("https://eventbuddy.africa/acme/events/123/register?ref=kingjesse");
  });
});

import { badgeRank, meetsVerified, nextBadgeHint } from "./promoters";

describe("badges", () => {
  it("ranks badges", () => {
    expect([badgeRank(null), badgeRank("starter"), badgeRank("seller"), badgeRank("captain")]).toEqual([0, 1, 2, 4]);
  });
  it("verified means Seller or higher", () => {
    expect(meetsVerified("starter")).toBe(false);
    expect(meetsVerified("seller")).toBe(true);
    expect(meetsVerified("captain")).toBe(true);
    expect(meetsVerified(null)).toBe(false);
  });
  it("hints at the next badge", () => {
    expect(nextBadgeHint(0, 0, null)).toBe("1 more ticket sold to reach Starter");
    expect(nextBadgeHint(7, 0, "starter")).toBe("3 more tickets sold to reach Seller");
    expect(nextBadgeHint(60, 9, "seller")).toBe("Keep refunds under 5% to reach Reliable");
    expect(nextBadgeHint(300, 0, "captain")).toBeNull();
  });
});
