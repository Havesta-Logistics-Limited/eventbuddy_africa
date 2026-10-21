import { describe, expect, it } from "vitest";
import { parseGuestLines } from "@/components/event-guest-list-tab";
import { inviteLabel } from "@/lib/invite-design";

describe("guest list import", () => {
  it("takes email and/or phone in any order, commas or spreadsheet tabs", () => {
    const g = parseGuestLines("Amaka Obi, amaka@example.com\nTunde Bello, 0803 000 0000\nDolapo Ade\t0812 000 0000\tdolapo@example.com\nNo Contact\nBad Email, nope");
    expect(g).toHaveLength(3);
    expect(g[0]).toMatchObject({ fullName: "Amaka Obi", email: "amaka@example.com" });
    expect(g[1]).toMatchObject({ fullName: "Tunde Bello", email: "", phone: "+2348030000000" });
    expect(g[2]).toMatchObject({ fullName: "Dolapo Ade", email: "dolapo@example.com", phone: "+2348120000000" });
  });
});

describe("name under the QR", () => {
  it("first, last, full or none", () => {
    expect(inviteLabel("Dolapo Adeyemi", "first")).toBe("DOLAPO");
    expect(inviteLabel("Dolapo Adeyemi", "last")).toBe("ADEYEMI");
    expect(inviteLabel("  Dolapo  Ade Adeyemi ", "full")).toBe("DOLAPO ADE ADEYEMI");
    expect(inviteLabel("Dolapo", "none")).toBe("");
  });
});
