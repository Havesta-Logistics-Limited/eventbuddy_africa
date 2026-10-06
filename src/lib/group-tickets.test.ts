import { describe, expect, it } from "vitest";
import { validateGroupGuests } from "./group-tickets";

const g = (n: number) => ({ firstName: `Guest`, lastName: `${n}`, email: `guest${n}@mail.com` });

describe("validateGroupGuests", () => {
  it("needs no guests for a single ticket", () => {
    expect(validateGroupGuests(1, undefined, "buyer@mail.com")).toEqual({ ok: true, guests: [] });
  });
  it("accepts exactly groupSize - 1 named guests", () => {
    const r = validateGroupGuests(4, [g(2), g(3), g(4)], "buyer@mail.com");
    expect(r.ok && r.guests.length).toBe(3);
  });
  it("rejects too few guests", () => {
    const r = validateGroupGuests(4, [g(2)], "buyer@mail.com");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("all 3 guests");
  });
  it("requires each guest's full name", () => {
    const r = validateGroupGuests(2, [{ firstName: "Ada", lastName: "", email: "ada@mail.com" }], "buyer@mail.com");
    expect(r).toEqual({ ok: false, error: "Enter guest 2's full name." });
  });
  it("requires a valid email", () => {
    const r = validateGroupGuests(2, [{ firstName: "Ada", lastName: "Obi", email: "ada@" }], "buyer@mail.com");
    expect(r).toEqual({ ok: false, error: "Enter a valid email for guest 2." });
  });
  it("rejects a guest reusing the buyer's email, case-insensitively", () => {
    const r = validateGroupGuests(2, [{ firstName: "Ada", lastName: "Obi", email: "Buyer@Mail.com" }], "buyer@mail.com");
    expect(r.ok).toBe(false);
  });
  it("rejects two guests sharing an email", () => {
    const r = validateGroupGuests(3, [g(2), { ...g(3), email: "guest2@mail.com" }], "buyer@mail.com");
    expect(r.ok).toBe(false);
  });
  it("trims whitespace", () => {
    const r = validateGroupGuests(2, [{ firstName: " Ada ", lastName: " Obi ", email: " ada@mail.com " }], "buyer@mail.com");
    expect(r.ok && r.guests[0]).toEqual({ firstName: "Ada", lastName: "Obi", email: "ada@mail.com" });
  });
});
