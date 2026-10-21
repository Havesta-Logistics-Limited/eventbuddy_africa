import { describe, expect, it } from "vitest";
import { filterRegistrations } from "@/components/prospects-tab";
import type { RegistrationRecord } from "@/lib/types";

const r = (o: Partial<RegistrationRecord>) => ({ id: o.referenceId, fullName: "", email: "", phone: "", status: "registered", ticketTypeId: null, ...o }) as RegistrationRecord;
const rows = [
  r({ referenceId: "LXBU-FZ7B", fullName: "Zoey Amobeda", email: "noelmobeda@gmail.com", status: "checked_in", ticketTypeId: "vip" }),
  r({ referenceId: "WT7W-DHGS", fullName: "King Jesse", email: "namobeda@gmail.com", phone: "+2347011096453", ticketTypeId: "early" }),
  r({ referenceId: "NEGC-VRRB", fullName: "Ada Obi", email: "ada@example.com", phone: "+2348109511825", status: "cancelled" }),
];
const ids = (q: string, s: Parameters<typeof filterRegistrations>[2] = "all", t = "all") => filterRegistrations(rows, q, s, t).map((x) => x.referenceId);

describe("registration search", () => {
  it("finds by name, email, reference and phone in any format", () => {
    expect(ids("king")).toEqual(["WT7W-DHGS"]);
    expect(ids("noelmobeda")).toEqual(["LXBU-FZ7B"]);
    expect(ids("negc vrrb")).toEqual(["NEGC-VRRB"]);
    expect(ids("07011096453")).toEqual(["WT7W-DHGS"]);
    expect(ids("+234 810 951")).toEqual(["NEGC-VRRB"]);
    expect(ids("8109511825")).toEqual(["NEGC-VRRB"]);
  });
  it("filters by status and ticket", () => {
    expect(ids("", "checked_in")).toEqual(["LXBU-FZ7B"]);
    expect(ids("", "not_checked_in")).toEqual(["WT7W-DHGS"]);
    expect(ids("", "cancelled")).toEqual(["NEGC-VRRB"]);
    expect(ids("", "all", "vip")).toEqual(["LXBU-FZ7B"]);
  });
});
