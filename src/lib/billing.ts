import { createClient } from "@/lib/supabase/client";

/** Fallback only — used before the live price has loaded, and as the seed value in
 *  the platform_settings migration. The actual, currently-in-effect price lives in
 *  the `platform_settings` table (see fetchCurrentEventPrice) so a platform admin can
 *  change it without a code deploy. */
export const EVENT_PRICE_NAIRA = 74985;

/** Publicly readable — the pricing page calls this unauthenticated. */
export async function fetchCurrentEventPrice(): Promise<number> {
  const supabase = createClient();
  const { data } = await supabase.from("platform_settings").select("event_price_naira").eq("id", true).maybeSingle();
  return data ? Number(data.event_price_naira) : EVENT_PRICE_NAIRA;
}

/** Platform-admin only — RLS rejects this for anyone else. Changes the price applied
 *  to events created from now on; past events keep the price they were actually
 *  charged (see events.price_naira and the events_set_price_naira trigger). */
export async function updateEventPrice(newPrice: number): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("platform_settings").update({ event_price_naira: newPrice, updated_at: new Date().toISOString() }).eq("id", true);
  if (error) throw error;
}

export const TICKET_FEE_PERCENTAGE = 5;

/** Publicly readable — the pricing page calls this unauthenticated to explain
 *  self-serve's "pay only transaction fees" model. */
export async function fetchCurrentTicketFeePercentage(): Promise<number> {
  const supabase = createClient();
  const { data } = await supabase.from("platform_settings").select("ticket_fee_percentage").eq("id", true).maybeSingle();
  return data ? Number(data.ticket_fee_percentage) : TICKET_FEE_PERCENTAGE;
}

/** Platform-admin only — RLS rejects this for anyone else. Only affects the
 *  percentage_charge baked into a NEW organization's Paystack subaccount at payout
 *  onboarding time (see /api/paystack/subaccount) — changing this doesn't retroactively
 *  update organizations that already have a subaccount. */
export async function updateTicketFeePercentage(newPercentage: number): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("platform_settings").update({ ticket_fee_percentage: newPercentage, updated_at: new Date().toISOString() }).eq("id", true);
  if (error) throw error;
}

/** Only physical events are billable — virtual events are free for every organization.
 *  Takes the raw format string directly (not a whole event object) so it works against
 *  both the org-scoped EventRecord's `eventFormat` and the platform admin's raw
 *  `event_format` DB rows without a shape mismatch. */
export function isBillable(eventFormat: string | null | undefined) {
  return eventFormat !== "virtual";
}

export function eventPrice(eventFormat: string | null | undefined) {
  return isBillable(eventFormat) ? EVENT_PRICE_NAIRA : 0;
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
