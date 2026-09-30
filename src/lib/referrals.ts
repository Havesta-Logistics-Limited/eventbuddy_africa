import { CommissionType, ReferralPartner } from "./types";

/**
 * Turn a ?ref= code from a share link into a referral id for this event.
 *
 * Deliberately total: an unknown code, an inactive partner, a code belonging to
 * another event, or the resolver itself failing all attribute to nobody and
 * return null. Attribution is bookkeeping — it must never be the reason someone
 * cannot register or buy a ticket.
 */
export async function resolveReferralId(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> },
  eventId: string,
  code?: string | null
): Promise<string | null> {
  const trimmed = typeof code === "string" ? code.trim() : "";
  if (!trimmed || trimmed.length > 40) return null;
  try {
    const { data, error } = await supabase.rpc("public_resolve_referral", {
      p_event_id: eventId,
      p_code: trimmed,
    });
    if (error) return null;
    return typeof data === "string" && data ? data : null;
  } catch {
    return null;
  }
}

/** What one partner brought in, and what that earns them. */
export type ReferralTally = {
  registrations: number;
  paidTickets: number;
  grossNaira: number;
  netNaira: number;
  commissionNaira: number;
};

export const COMMISSION_LABELS: Record<CommissionType, string> = {
  percent_gross: "% of ticket price",
  percent_net: "% of payout (after fees)",
  fixed_per_sale: "₦ per paid ticket",
  fixed_per_reg: "₦ per registration",
  none: "No commission",
};

/**
 * What this partner is owed.
 *
 * Percentages run on money that actually settled, so a pending or failed
 * checkout earns nothing; `gross` is what the buyer paid and `net` is what
 * reached the organizer after eventbuddy's cut, which is why both are offered —
 * paying a partner a share of money you never received is a real way to lose
 * money on a sale.
 */
export function commissionFor(
  partner: Pick<ReferralPartner, "commissionType" | "commissionRate">,
  tally: Pick<ReferralTally, "registrations" | "paidTickets" | "grossNaira" | "netNaira">
): number {
  const rate = Number(partner.commissionRate) || 0;
  if (rate <= 0 || partner.commissionType === "none") return 0;

  switch (partner.commissionType) {
    case "percent_gross":
      return round2((tally.grossNaira * rate) / 100);
    case "percent_net":
      return round2((tally.netNaira * rate) / 100);
    case "fixed_per_sale":
      return round2(tally.paidTickets * rate);
    case "fixed_per_reg":
      return round2(tally.registrations * rate);
    default:
      return 0;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The link a partner shares. Points at the public registration page, which is
 *  the event's real public entry point (canonicalEventPath's vanity `/{slug}`
 *  form has no route serving it today). */
export function referralLink(siteUrl: string, orgSlug: string, eventId: string, code: string): string {
  const base = siteUrl.replace(/\/$/, "");
  return `${base}/${orgSlug}/events/${eventId}/register?ref=${encodeURIComponent(code)}`;
}
