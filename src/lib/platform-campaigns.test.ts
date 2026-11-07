import { describe, expect, it } from "vitest";
import { buildCampaignEmail, greetingLine } from "./platform-campaigns";

describe("greetingLine", () => {
  it("greets by first name with the chosen word", () => {
    expect(greetingLine({ mode: "name", prefix: "Dear", fallback: "Hi friend," }, "Ada Obi")).toBe("Dear Ada,");
  });
  it("uses the fallback line when the list has no name", () => {
    expect(greetingLine({ mode: "name", prefix: "Hi", fallback: "Hi friend," }, "")).toBe("Hi friend,");
  });
  it("can be turned off", () => {
    expect(greetingLine({ mode: "none" }, "Ada Obi")).toBe("");
  });
  it("older campaigns without a setting keep the original greeting", () => {
    expect(greetingLine(null, "")).toBe("Hi there,");
    expect(greetingLine(undefined, "Noel Amobeda")).toBe("Hi Noel,");
  });
});

describe("buildCampaignEmail greeting", () => {
  const base = { id: "c1", subject: "S", messageHtml: "<p>Tickets are live</p>" };
  it("puts the greeting first in both versions, escaped in the HTML", () => {
    const e = buildCampaignEmail({ email: "a@x.com", fullName: "<b>Ada</b>" }, { ...base, greeting: { mode: "name", prefix: "Hi", fallback: "Hi there," } }, "https://u");
    expect(e.html).toContain("Hi &lt;b&gt;Ada&lt;/b&gt;,");
    expect(e.text.startsWith("Hi <b>Ada</b>,\n\nTickets are live")).toBe(true);
  });
  it("leaves the greeting out entirely when it's off", () => {
    const e = buildCampaignEmail({ email: "a@x.com", fullName: "Ada" }, { ...base, greeting: { mode: "none" } }, "https://u");
    expect(e.html).not.toContain("Hi ");
    expect(e.text.startsWith("Tickets are live")).toBe(true);
  });
});
