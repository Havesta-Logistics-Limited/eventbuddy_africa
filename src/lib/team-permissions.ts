/**
 * Team permissions per page (migration 0137): each team member has an access
 * level for each part of the dashboard. The database enforces the same rules
 * (section_org_ids / section_event_ids); this mirrors them for the menu, page
 * guards, "View only" notices and server routes. The owner has everything,
 * plus the owner-only actions (team, bank account, payouts, deleting).
 */

export const TEAM_SECTIONS = ["events", "leads", "audience", "payouts", "settings"] as const;
export type TeamSection = (typeof TEAM_SECTIONS)[number];
export type TeamAccess = "none" | "view" | "edit";
export type TeamPermissions = Record<TeamSection, TeamAccess>;

export const SECTION_LABELS: Record<TeamSection, string> = {
  events: "Events",
  leads: "Leads",
  audience: "Audience",
  payouts: "Payouts",
  settings: "Settings",
};

export const SECTION_HINTS: Record<TeamSection, string> = {
  events: "Events, registrations, tickets, check-in, guests, promoters and marketing",
  leads: "Leads captured at events",
  audience: "Followers, contacts and newsletters",
  payouts: "Balance, sales and payments",
  settings: "Organization profile, branding and plan",
};

export const FULL_ACCESS: TeamPermissions = { events: "edit", leads: "edit", audience: "edit", payouts: "edit", settings: "edit" };
export const VIEW_EVERYTHING: TeamPermissions = { events: "view", leads: "view", audience: "view", payouts: "view", settings: "view" };
/** one event: its pages are Events and Leads */
export const EVENT_HELPER: TeamPermissions = { events: "edit", leads: "edit", audience: "none", payouts: "none", settings: "none" };

export function parsePermissions(raw: unknown, role: "admin" | "event_support" = "admin"): TeamPermissions {
  const base = role === "event_support" ? EVENT_HELPER : FULL_ACCESS;
  if (!raw || typeof raw !== "object") return { ...base };
  const r = raw as Record<string, unknown>;
  const out = { ...base };
  for (const s of TEAM_SECTIONS) {
    const v = r[s];
    if (v === "none" || v === "view" || v === "edit") out[s] = v;
  }
  return out;
}

/** `permissions` undefined = the owner (everything). */
export function canView(permissions: TeamPermissions | undefined | null, section: TeamSection): boolean {
  return !permissions || permissions[section] !== "none";
}
export function canEdit(permissions: TeamPermissions | undefined | null, section: TeamSection): boolean {
  return !permissions || permissions[section] === "edit";
}

/** Which preset these permissions match, if any. */
export function presetOf(p: TeamPermissions): "full" | "view" | "helper" | "custom" {
  const same = (a: TeamPermissions) => TEAM_SECTIONS.every((s) => a[s] === p[s]);
  if (same(FULL_ACCESS)) return "full";
  if (same(VIEW_EVERYTHING)) return "view";
  if (same(EVENT_HELPER)) return "helper";
  return "custom";
}

/** e.g. "Events: Edit · Leads: View · Payouts: No access" (sections with access first). */
export function summarizePermissions(p: TeamPermissions): string {
  const preset = presetOf(p);
  if (preset === "full") return "Full access";
  if (preset === "view") return "View everything";
  const word = { edit: "Edit", view: "View", none: "No access" } as const;
  return TEAM_SECTIONS.filter((s) => p[s] !== "none")
    .map((s) => `${SECTION_LABELS[s]}: ${word[p[s]]}`)
    .join(" · ") || "No access";
}

export function sanitizePermissions(raw: unknown): TeamPermissions | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out = {} as TeamPermissions;
  for (const s of TEAM_SECTIONS) {
    const v = r[s];
    if (v !== "none" && v !== "view" && v !== "edit") return null;
    out[s] = v;
  }
  return out;
}
