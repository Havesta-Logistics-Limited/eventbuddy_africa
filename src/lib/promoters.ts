/** Shared promoter rules (migration 0105), used by checkout fulfillment, the
 *  join/invite routes and their tests. */

/** Handles are public and part of share links: 3–24 lower-case letters,
 *  digits or underscores, and never a word the [slug]/[handle] route uses. */
const RESERVED_HANDLES = new Set(["events", "rep-login", "staff-setup", "register", "rsvp", "hub", "admin", "eventbuddy", "support", "promoter", "promoters", "marketplace"]);

export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

export function validateHandle(raw: string): { ok: true; handle: string } | { ok: false; error: string } {
  const handle = normalizeHandle(raw);
  if (!/^[a-z0-9_]{3,24}$/.test(handle)) return { ok: false, error: "Use 3 to 24 lower-case letters, numbers or underscores." };
  if (RESERVED_HANDLES.has(handle)) return { ok: false, error: "That handle is reserved. Try another." };
  return { ok: true, handle };
}

/** A promoter's commission on one paid purchase: a % of what the organizer
 *  nets after eventbuddy's fee, capped per person admitted when the organizer
 *  set a cap (a group ticket for 4 can earn up to 4 × the cap). In naira,
 *  rounded to kobo. */
export function promoterCommission(params: { amountNaira: number; feeNaira: number; pct: number; capNaira: number | null; people: number }): number {
  const net = Math.max(0, params.amountNaira - params.feeNaira);
  let c = (net * params.pct) / 100;
  if (params.capNaira != null && params.capNaira > 0) c = Math.min(c, params.capNaira * Math.max(1, Math.floor(params.people)));
  return Math.round(c * 100) / 100;
}

/** The public link a promoter shares: the short /<event-slug>/<handle> form
 *  when the event has a custom link, otherwise the register page with ?ref=. */
export function promoterLink(siteUrl: string, e: { slug?: string | null; orgSlug: string; eventId: string }, handle: string): string {
  const base = siteUrl.replace(/\/$/, "");
  return e.slug ? `${base}/${e.slug}/${handle}` : `${base}/${e.orgSlug}/events/${e.eventId}/register?ref=${encodeURIComponent(handle)}`;
}
