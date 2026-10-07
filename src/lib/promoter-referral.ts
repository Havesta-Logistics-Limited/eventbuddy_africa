import type { SupabaseClient } from "@supabase/supabase-js";

/** Puts a promoter on an event: an event_referrals row with their handle as
 *  the ?ref= code. Shared by a promoter joining and an organizer inviting.
 *  The database enforces the plan's promoter limit (enforce_promoter_limit).
 *  Re-joining reactivates a paused row instead of failing. */
export async function addPromoterToEvent(
  supabase: SupabaseClient,
  event: { id: string; organization_id: string; promoter_commission_pct: number | string },
  promoter: { id: string; handle: string; full_name: string; email: string; phone?: string | null },
  // only the organizer (invite) may bring back a promoter they paused
  opts: { reactivate?: boolean } = {}
): Promise<{ ok: true; referralId: string } | { ok: false; error: string; status: number }> {
  const { data: existing } = await supabase.from("event_referrals").select("id, is_active").eq("event_id", event.id).eq("promoter_id", promoter.id).maybeSingle();
  if (existing) {
    if (existing.is_active) return { ok: true, referralId: existing.id };
    if (!opts.reactivate) return { ok: false, error: "The organizer has paused you on this event.", status: 403 };
    const { error } = await supabase.from("event_referrals").update({ is_active: true }).eq("id", existing.id);
    if (error) return { ok: false, error: error.message, status: 409 };
    return { ok: true, referralId: existing.id };
  }
  const { data, error } = await supabase
    .from("event_referrals")
    .insert({
      organization_id: event.organization_id,
      event_id: event.id,
      promoter_id: promoter.id,
      code: promoter.handle,
      partner_name: `${promoter.full_name} (@${promoter.handle})`,
      partner_email: promoter.email,
      partner_phone: promoter.phone ?? null,
      // shown in the organizer's referral report; the ledger uses the event's live settings
      commission_type: "percent_net",
      commission_rate: Number(event.promoter_commission_pct),
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: `This event already has a referral link with the code "${promoter.handle}".`, status: 409 };
    return { ok: false, error: error.message, status: error.code === "P0001" ? 409 : 500 };
  }
  return { ok: true, referralId: data.id };
}
