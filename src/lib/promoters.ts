/** Shared promoter rules (migration 0105), used by checkout fulfillment, the
 *  join/invite routes and their tests. */

/** Handles are public and part of share links: 3–24 lower-case letters,
 *  digits or underscores, and never a word the [slug]/[handle] route uses. */
const RESERVED_HANDLES = new Set(["events", "rep-login", "staff-setup", "register", "rsvp", "hub", "admin", "eventbuddy", "support", "promoter", "promoters", "marketplace", "tours", "exhibit"]);

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

/** A promoter's link to a whole tour: the buyer picks their city on the tour
 *  page and the handle rides along to that city's ticket page. */
export function promoterTourLink(siteUrl: string, t: { orgSlug: string; tourSlug: string }, handle: string): string {
  return `${siteUrl.replace(/\/$/, "")}/${t.orgSlug}/tours/${t.tourSlug}/${handle}`;
}

/** Promoter badges (migration 0106): earned from real attributed sales only.
 *  Keep in step with _promoter_stats in the migration. */
export type PromoterBadge = "starter" | "seller" | "reliable" | "captain";

export const BADGES: { id: PromoterBadge; label: string; minSales: number; maxRefundPct?: number }[] = [
  { id: "starter", label: "Starter", minSales: 1 },
  { id: "seller", label: "Seller", minSales: 10 },
  { id: "reliable", label: "Reliable", minSales: 50, maxRefundPct: 5 },
  { id: "captain", label: "Captain", minSales: 200, maxRefundPct: 5 },
];

export function badgeRank(b: PromoterBadge | null | undefined): number {
  return b ? BADGES.findIndex((x) => x.id === b) + 1 : 0;
}

/** Verified-only events take promoters with the Seller badge or higher. */
export function meetsVerified(b: PromoterBadge | null | undefined): boolean {
  return badgeRank(b) >= badgeRank("seller");
}

/** What the next badge needs, for the promoter's own dashboard. */
export function nextBadgeHint(sales: number, refunded: number, current: PromoterBadge | null): string | null {
  const next = BADGES[badgeRank(current)];
  if (!next) return null;
  const missing = Math.max(0, next.minSales - sales);
  if (missing > 0) return `${missing} more ticket${missing === 1 ? "" : "s"} sold to reach ${next.label}`;
  if (next.maxRefundPct != null) return `Keep refunds under ${next.maxRefundPct}% to reach ${next.label}`;
  return null;
}
