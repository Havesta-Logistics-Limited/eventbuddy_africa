import { describe, expect, it } from "vitest";
import { buildCsp, newNonce } from "./csp";

describe("buildCsp", () => {
  it("only trusts scripts carrying this request's nonce", () => {
    const nonce = newNonce();
    const csp = buildCsp(nonce);
    expect(csp).toContain(`'nonce-${nonce}'`);
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("allows the services the site loads: analytics, Turnstile, Paystack", () => {
    const csp = buildCsp("x");
    for (const host of ["https://*.googletagmanager.com", "https://challenges.cloudflare.com", "https://*.paystack.com"]) expect(csp).toContain(host);
  });

  it("makes a different nonce every time", () => {
    expect(newNonce()).not.toBe(newNonce());
  });
});
