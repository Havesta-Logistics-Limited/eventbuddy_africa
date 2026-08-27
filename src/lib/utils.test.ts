import { describe, expect, it } from "vitest";
import { generateReferenceId, safeHttpUrl } from "./utils";

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
