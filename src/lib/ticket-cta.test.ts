import { describe, expect, it } from "vitest";
import { ticketCtaLabel } from "./ticket-cta";

describe("ticketCtaLabel", () => {
  it("says Register with no tickets or only free ones", () => {
    expect(ticketCtaLabel([])).toBe("Register");
    expect(ticketCtaLabel([0, 0])).toBe("Register");
  });
  it("says Buy Ticket when every ticket is paid", () => {
    expect(ticketCtaLabel([12000, 40000])).toBe("Buy Ticket");
  });
  it("says Get Tickets when free and paid are mixed", () => {
    expect(ticketCtaLabel([0, 12000])).toBe("Get Tickets");
  });
});
