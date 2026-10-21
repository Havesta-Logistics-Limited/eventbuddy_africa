import { describe, expect, it } from "vitest";
import { EVENT_HELPER, FULL_ACCESS, VIEW_EVERYTHING, canEdit, canView, parsePermissions, presetOf, sanitizePermissions, summarizePermissions } from "./team-permissions";

describe("team permissions", () => {
  it("owner (no permissions) has everything", () => {
    expect(canView(undefined, "payouts")).toBe(true);
    expect(canEdit(undefined, "settings")).toBe(true);
  });
  it("view, edit, none", () => {
    const p = { ...VIEW_EVERYTHING, payouts: "none" as const, events: "edit" as const };
    expect(canEdit(p, "events")).toBe(true);
    expect(canView(p, "leads")).toBe(true);
    expect(canEdit(p, "leads")).toBe(false);
    expect(canView(p, "payouts")).toBe(false);
  });
  it("presets and summaries", () => {
    expect(presetOf(FULL_ACCESS)).toBe("full");
    expect(presetOf(EVENT_HELPER)).toBe("helper");
    expect(summarizePermissions(VIEW_EVERYTHING)).toBe("View everything");
    expect(summarizePermissions({ ...VIEW_EVERYTHING, payouts: "none", events: "edit" })).toBe("Events: Edit · Leads: View · Audience: View · Settings: View");
  });
  it("parses old rows by role and rejects junk", () => {
    expect(parsePermissions(null, "event_support")).toEqual(EVENT_HELPER);
    expect(parsePermissions({ events: "view" }, "admin")).toEqual({ ...FULL_ACCESS, events: "view" });
    expect(sanitizePermissions({ ...FULL_ACCESS, payouts: "owner" })).toBeNull();
  });
});
