import { describe, expect, it } from "vitest";
import { getCaptureGate, getEventStatus, getRegistrationGate } from "./capture-window";

const window = { date: "2026-06-15", startTime: "09:00", endTime: "17:00" };
const before = new Date("2026-06-14T12:00:00Z");
const during = new Date("2026-06-15T12:00:00Z");
const after = new Date("2026-06-16T12:00:00Z");

describe("getCaptureGate (lead capture — only open during the event)", () => {
  it("is closed before the event starts", () => {
    const gate = getCaptureGate(window, undefined, null, before);
    expect(gate.open).toBe(false);
    expect(gate.reason).toBe("not_started");
  });

  it("is open during the event", () => {
    expect(getCaptureGate(window, undefined, null, during).open).toBe(true);
  });

  it("is closed after the event ends", () => {
    const gate = getCaptureGate(window, undefined, null, after);
    expect(gate.open).toBe(false);
    expect(gate.reason).toBe("ended");
  });

  it("an admin override forces it open even before the event starts", () => {
    expect(getCaptureGate(window, undefined, "open", before).open).toBe(true);
  });

  it("an admin override forces it closed even during the event", () => {
    const gate = getCaptureGate(window, undefined, "closed", during);
    expect(gate.open).toBe(false);
    expect(gate.reason).toBe("manually_closed");
  });
});

describe("getRegistrationGate (registration — open in advance, until the event ends)", () => {
  it("is open before the event starts (unlike capture)", () => {
    expect(getRegistrationGate(window, undefined, null, before).open).toBe(true);
  });

  it("is open during the event", () => {
    expect(getRegistrationGate(window, undefined, null, during).open).toBe(true);
  });

  it("is closed once the event has ended", () => {
    const gate = getRegistrationGate(window, undefined, null, after);
    expect(gate.open).toBe(false);
    expect(gate.reason).toBe("ended");
  });

  it("an admin override forces it closed even before the event starts", () => {
    const gate = getRegistrationGate(window, undefined, "closed", before);
    expect(gate.open).toBe(false);
    expect(gate.reason).toBe("manually_closed");
  });
});

describe("getEventStatus", () => {
  it("is upcoming before the event starts", () => {
    expect(getEventStatus(window, before)).toBe("upcoming");
  });

  it("is active during the event", () => {
    expect(getEventStatus(window, during)).toBe("active");
  });

  it("is completed after the event ends", () => {
    expect(getEventStatus(window, after)).toBe("completed");
  });
});
