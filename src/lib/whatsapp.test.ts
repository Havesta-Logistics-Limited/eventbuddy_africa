import { afterEach, describe, expect, it } from "vitest";
import { chatIdFor, inviteMessage, phoneFromChatId, phoneVariants, reminderMessage, STOP_LINE, ticketMessage, whatsappAllowedFor, whatsappConfig } from "@/lib/whatsapp";

const event = { name: "Ada & Tunde's Wedding", date: "2026-12-12", start_time: "14:00", end_time: "20:00", venue: "Eko Hotel", location: "Lagos" };

describe("whatsapp phone helpers", () => {
  it("turns any Nigerian format into a WhatsApp chat id", () => {
    expect(chatIdFor("0801 234 5678")).toBe("2348012345678@c.us");
    expect(chatIdFor("+234 801 234 5678")).toBe("2348012345678@c.us");
    expect(chatIdFor("not a phone")).toBeNull();
  });
  it("reads a phone back from a chat id, and ignores groups and lids", () => {
    expect(phoneFromChatId("2348012345678@c.us")).toBe("+2348012345678");
    expect(phoneFromChatId("120363000000000000@g.us")).toBeNull();
    expect(phoneFromChatId("123456789012345@lid")).toBeNull();
  });
  it("lists the stored forms of one number", () => {
    expect(phoneVariants("08012345678").sort()).toEqual(["+2348012345678", "08012345678", "2348012345678"].sort());
    expect(phoneVariants("junk")).toEqual([]);
  });
});

describe("whatsapp messages", () => {
  it("every message we start says how to stop", () => {
    expect(inviteMessage("Bola Ade", event, "Ade Family")).toContain(STOP_LINE);
    expect(ticketMessage("Bola Ade", event, "ABCD-1234")).toContain(STOP_LINE);
    expect(reminderMessage("Bola Ade", event, "ABCD-1234")).toContain(STOP_LINE);
  });
  it("greets by first name and carries the event details", () => {
    const m = ticketMessage("Bola Ade", event, "ABCD-1234", "https://eventbuddy.africa/hub");
    expect(m).toMatch(/^Hi Bola,/);
    expect(m).toContain("ABCD-1234");
    expect(m).toContain("Eko Hotel, Lagos");
    expect(m).toContain("https://eventbuddy.africa/hub");
    expect(m).not.toMatch(/\n\n\n/);
  });
});

describe("whatsapp switches", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });
  it("is off unless enabled and a server is set", () => {
    delete process.env.WHATSAPP_ENABLED;
    process.env.WAHA_URL = "http://waha:3000";
    expect(whatsappConfig()).toBeNull();
    process.env.WHATSAPP_ENABLED = "true";
    expect(whatsappConfig()?.url).toBe("http://waha:3000");
  });
  it("limits the pilot to listed organizers", () => {
    process.env.WHATSAPP_ENABLED = "true";
    process.env.WAHA_URL = "http://waha:3000";
    process.env.WHATSAPP_ORGS = "pilot-org, 1111";
    expect(whatsappAllowedFor({ slug: "pilot-org" })).toBe(true);
    expect(whatsappAllowedFor({ id: "1111" })).toBe(true);
    expect(whatsappAllowedFor({ id: "2222", slug: "other" })).toBe(false);
    process.env.WHATSAPP_ORGS = "";
    expect(whatsappAllowedFor({ slug: "other" })).toBe(true);
  });
});
