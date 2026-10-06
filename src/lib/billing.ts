import { createClient } from "@/lib/supabase/client";

/** eventbuddy's fee on every paid ticket: a percentage of the price actually paid
 *  plus a flat Naira amount (5% + ₦100 at launch, migration 0098). These constants
 *  are only fallbacks — the live values come from platform_settings. */
export const TICKET_FEE_PERCENTAGE = 5;
export const TICKET_FEE_FLAT_NAIRA = 100;

export type TicketFee = { percentage: number; flatNaira: number };
export const DEFAULT_TICKET_FEE: TicketFee = { percentage: TICKET_FEE_PERCENTAGE, flatNaira: TICKET_FEE_FLAT_NAIRA };

/** Reads a platform_settings row (or null) into a TicketFee, falling back field by
 *  field so a row from before migration 0098 still yields a sensible fee. */
export function ticketFeeFromSettings(row: { ticket_fee_percentage?: unknown; ticket_fee_flat_naira?: unknown } | null | undefined): TicketFee {
  const pct = Number(row?.ticket_fee_percentage);
  const flat = Number(row?.ticket_fee_flat_naira);
  return {
    percentage: Number.isFinite(pct) ? pct : TICKET_FEE_PERCENTAGE,
    flatNaira: Number.isFinite(flat) && row?.ticket_fee_flat_naira != null ? flat : TICKET_FEE_FLAT_NAIRA,
  };
}

/** "5% + ₦100", or just "5%" when the flat part is zero. Used everywhere the fee is
 *  shown so the wording can never drift from what checkout charges. */
export function formatTicketFee(fee: TicketFee): string {
  const pct = `${Number(fee.percentage.toFixed(2))}%`;
  return fee.flatNaira > 0 ? `${pct} + ${formatNaira(fee.flatNaira)}` : pct;
}

/** An organizer plan's ticket fee (migration 0104). Launch stores no fee of its
 *  own and uses the platform default, so the existing platform fee editor stays
 *  the Launch rate; Grow and Scale set their own. */
export function planTicketFee(
  plan: { fee_percentage?: unknown; fee_flat_naira?: unknown } | null | undefined,
  platformDefault: TicketFee
): TicketFee {
  const pct = plan?.fee_percentage == null ? NaN : Number(plan.fee_percentage);
  const flat = plan?.fee_flat_naira == null ? NaN : Number(plan.fee_flat_naira);
  return {
    percentage: Number.isFinite(pct) ? pct : platformDefault.percentage,
    flatNaira: Number.isFinite(flat) ? flat : platformDefault.flatNaira,
  };
}

/** eventbuddy's cut of one paid ticket, in kobo — what checkout passes to Paystack
 *  as transaction_charge. Computed on the price actually paid (after any discount).
 *  For a group ticket, pass `people` (how many it admits): the flat part is
 *  charged per person. Never more than the payment itself, so a very cheap ticket can't produce a charge
 *  Paystack would reject; at that point the whole payment is the fee. */
export function ticketFeeMinor(amountNaira: number, fee: TicketFee, people = 1): number {
  const amountMinor = Math.round(amountNaira * 100);
  if (amountMinor <= 0) return 0;
  // A group ticket pays the flat part once per person admitted (2026-10-06):
  // a bundle for 4 earns the same as 4 single tickets.
  const heads = Math.max(1, Math.floor(people));
  const feeMinor = Math.round(amountMinor * (fee.percentage / 100)) + Math.round(fee.flatNaira * 100) * heads;
  return Math.min(Math.max(0, feeMinor), amountMinor);
}

/** Publicly readable — the landing and pricing pages call this unauthenticated. */
export async function fetchCurrentTicketFee(): Promise<TicketFee> {
  const supabase = createClient();
  const { data } = await supabase.from("platform_settings").select("ticket_fee_percentage, ticket_fee_flat_naira").eq("id", true).maybeSingle();
  return ticketFeeFromSettings(data);
}

/** Platform-admin only — RLS rejects this for anyone else. Takes effect on every
 *  organization's next paid checkout, since checkout computes the fee per payment
 *  (see the ticket-purchase initialize route). */
export async function updateTicketFee(fee: TicketFee): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("platform_settings")
    .update({ ticket_fee_percentage: fee.percentage, ticket_fee_flat_naira: fee.flatNaira, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) throw error;
}

export function formatNaira(n: number) {
  return `₦${Math.round(n).toLocaleString("en-NG")}`;
}

/** Applies a discount code's type/value (and optional Naira cap) to a ticket's
 *  price — shared by the public checkout preview (client) and the ticket-purchase
 *  initialize route (server) so the price a buyer previews always matches what
 *  they're actually charged. Clamped to never go below 0 (a fixed-amount code
 *  larger than the ticket price is free, not negative). Rounded to the nearest
 *  whole Naira — there are no sub-unit prices shown anywhere in the product. */
export function applyDiscount(priceNaira: number, discountType: "percentage" | "fixed", discountValue: number, maxDiscountNaira?: number | null): number {
  const rawDiscount = discountType === "percentage" ? priceNaira * (discountValue / 100) : discountValue;
  const cappedDiscount = maxDiscountNaira != null ? Math.min(rawDiscount, maxDiscountNaira) : rawDiscount;
  return Math.max(0, Math.round(priceNaira - cappedDiscount));
}
