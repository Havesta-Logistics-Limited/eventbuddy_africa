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

/** Card processing charged to the buyer on top of a paid ticket (migration
 *  0130): Paystack's rate, which eventbuddy otherwise absorbs under held funds. */
export type ProcessingFee = { enabled: boolean; percentage: number; flatNaira: number; flatWaivedBelowNaira: number; capNaira: number };
export const DEFAULT_PROCESSING_FEE: ProcessingFee = { enabled: true, percentage: 1.5, flatNaira: 100, flatWaivedBelowNaira: 2500, capNaira: 2000 };

export function processingFeeFromSettings(row: Record<string, unknown> | null | undefined): ProcessingFee {
  if (!row) return { ...DEFAULT_PROCESSING_FEE, enabled: false };
  const num = (v: unknown, d: number) => (v == null || !Number.isFinite(Number(v)) ? d : Number(v));
  return {
    enabled: row.buyer_pays_processing === true,
    percentage: num(row.processing_fee_percentage, DEFAULT_PROCESSING_FEE.percentage),
    flatNaira: num(row.processing_fee_flat_naira, DEFAULT_PROCESSING_FEE.flatNaira),
    flatWaivedBelowNaira: num(row.processing_fee_flat_waived_below_naira, DEFAULT_PROCESSING_FEE.flatWaivedBelowNaira),
    capNaira: num(row.processing_fee_cap_naira, DEFAULT_PROCESSING_FEE.capNaira),
  };
}

/** The processing fee for a ticket of `amountNaira`, in whole naira: the
 *  smallest top-up such that, after Paystack charges its rate on the total,
 *  at least the ticket price is left. 0 when switched off or for a free ticket. */
export function processingFeeNaira(amountNaira: number, pf: ProcessingFee): number {
  const x = Math.round(amountNaira * 100);
  if (!pf.enabled || x <= 0) return 0;
  const p = Math.min(Math.max(pf.percentage, 0), 99) / 100;
  const flat = Math.round(pf.flatNaira * 100);
  const waive = Math.round(pf.flatWaivedBelowNaira * 100);
  const cap = Math.round(pf.capNaira * 100);
  const paystackFee = (charge: number) => Math.min(p * charge + (charge >= waive ? flat : 0), cap);
  let charge = Math.ceil(x / (1 - p));
  if (charge >= waive) charge = Math.ceil((x + flat) / (1 - p));
  // past the cap Paystack takes the cap, so the cap on top is enough
  if (cap > 0 && p * charge + (charge >= waive ? flat : 0) > cap) charge = x + cap;
  while (charge - paystackFee(charge) < x) charge++;
  return Math.ceil((charge - x) / 100);
}

export async function fetchProcessingFee(): Promise<ProcessingFee> {
  const supabase = createClient();
  const { data } = await supabase
    .from("platform_settings")
    .select("buyer_pays_processing, processing_fee_percentage, processing_fee_flat_naira, processing_fee_flat_waived_below_naira, processing_fee_cap_naira")
    .eq("id", true)
    .maybeSingle();
  return processingFeeFromSettings(data);
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
