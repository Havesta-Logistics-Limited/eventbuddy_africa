import { describe, expect, it } from "vitest";
import { generateReferenceId, generateRecurrenceDates, safeHttpUrl } from "./utils";

describe("generateReferenceId", () => {
  it("produces an XXXX-XXXX shaped code", () => {
    expect(generateReferenceId()).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it("is not trivially collidable across many calls (sanity check, not a proof)", () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateReferenceId()));
    expect(codes.size).toBe(500);
  });
});

describe("safeHttpUrl", () => {
  it("allows http(s) URLs", () => {
    expect(safeHttpUrl("https://zoom.us/j/123")).toBe("https://zoom.us/j/123");
    expect(safeHttpUrl("http://example.com")).toBe("http://example.com");
  });

  it("rejects a javascript: URI — the stored-XSS vector this guards against", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeUndefined();
  });

  it("rejects a data: URI", () => {
    expect(safeHttpUrl("data:text/html,<script>alert(1)</script>")).toBeUndefined();
  });

  it("passes through null/undefined/empty as undefined", () => {
    expect(safeHttpUrl(null)).toBeUndefined();
    expect(safeHttpUrl(undefined)).toBeUndefined();
    expect(safeHttpUrl("")).toBeUndefined();
  });

  it("trims whitespace before checking the scheme", () => {
    expect(safeHttpUrl("  https://example.com  ")).toBe("https://example.com");
  });
});

describe("generateRecurrenceDates", () => {
  it("steps weekly, including the first occurrence unchanged", () => {
    const dates = generateRecurrenceDates("2026-01-05", undefined, "weekly", 3);
    expect(dates).toEqual([{ date: "2026-01-05" }, { date: "2026-01-12" }, { date: "2026-01-19" }]);
  });

  it("steps biweekly", () => {
    const dates = generateRecurrenceDates("2026-01-05", undefined, "biweekly", 3);
    expect(dates.map((d) => d.date)).toEqual(["2026-01-05", "2026-01-19", "2026-02-02"]);
  });

  it("steps monthly, including across a year boundary", () => {
    const dates = generateRecurrenceDates("2026-12-15", undefined, "monthly", 3);
    expect(dates.map((d) => d.date)).toEqual(["2026-12-15", "2027-01-15", "2027-02-15"]);
  });

  it("preserves a multi-day span for every occurrence", () => {
    const dates = generateRecurrenceDates("2026-01-05", "2026-01-07", "weekly", 2);
    expect(dates).toEqual([
      { date: "2026-01-05", endDate: "2026-01-07" },
      { date: "2026-01-12", endDate: "2026-01-14" },
    ]);
  });

  it("omits endDate for a single-day event", () => {
    const dates = generateRecurrenceDates("2026-01-05", "2026-01-05", "weekly", 1);
    expect(dates).toEqual([{ date: "2026-01-05" }]);
  });
});
