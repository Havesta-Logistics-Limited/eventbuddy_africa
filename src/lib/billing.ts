import { createClient } from "@/lib/supabase/client";

/** Fallback only — used before the live price has loaded, and as the seed value in
 *  the platform_settings migration. The actual, currently-in-effect price lives in
 *  the `platform_settings` table (see fetchCurrentEventPrice) so a platform admin can
 *  change it without a code deploy. */
export const EVENT_PRICE_USD = 49.99;

/** Publicly readable — the pricing page calls this unauthenticated. */
export async function fetchCurrentEventPrice(): Promise<number> {
  const supabase = createClient();
  const { data } = await supabase.from("platform_settings").select("event_price_usd").eq("id", true).maybeSingle();
  return data ? Number(data.event_price_usd) : EVENT_PRICE_USD;
}

/** Platform-admin only — RLS rejects this for anyone else. Changes the price applied
 *  to events created from now on; past events keep the price they were actually
 *  charged (see events.price_usd and the events_set_price_usd trigger). */
export async function updateEventPrice(newPrice: number): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("platform_settings").update({ event_price_usd: newPrice, updated_at: new Date().toISOString() }).eq("id", true);
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
  return isBillable(eventFormat) ? EVENT_PRICE_USD : 0;
}

export function formatUSD(n: number) {
  return `$${n.toFixed(2)}`;
}
