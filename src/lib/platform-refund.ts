import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The eventbuddy side of a platform admin refund (/api/platform/refund), run
 * after Paystack has reversed the charge and handleRefundOrDispute has
 * cancelled the ticket and debited the organizer's held balance.
 *
 *  - notes who refunded and why on the organizer's refund ledger line
 *  - absorb "eventbuddy": credits the organizer an adjustment so their balance
 *    ends where it was before the refund. The refund came off their balance
 *    and any promoter commission came back to them, so the credit is the
 *    refund less that commission.
 *
 * Only for held sales; a sale split straight to the organizer's bank has no
 * eventbuddy balance to adjust. Returns the credit posted (0 if none).
 */
export async function recordPlatformRefund(
  admin: SupabaseClient,
  txn: { id: string; organization_id: string; event_id: string; amount_naira: number | string; settlement: string | null },
  absorb: "organizer" | "eventbuddy",
  reason: string,
  userId: string
): Promise<number> {
  if (txn.settlement !== "held") return 0;
  await admin.from("ledger_entries").update({ note: `Refunded by eventbuddy: ${reason}`, created_by: userId }).eq("transaction_id", txn.id).eq("kind", "refund");
  if (absorb !== "eventbuddy") return 0;
  const { data: back } = await admin.from("ledger_entries").select("amount_naira").eq("transaction_id", txn.id).eq("kind", "commission_refund").maybeSingle();
  const credit = Math.round((Number(txn.amount_naira) - Number(back?.amount_naira ?? 0)) * 100) / 100;
  if (credit <= 0) return 0;
  const { error } = await admin.from("ledger_entries").upsert(
    {
      organization_id: txn.organization_id,
      event_id: txn.event_id,
      transaction_id: txn.id,
      kind: "adjustment",
      amount_naira: credit,
      clears_at: new Date().toISOString(),
      note: `Refund covered by eventbuddy: ${reason}`,
      created_by: userId,
    },
    { onConflict: "transaction_id,kind", ignoreDuplicates: true }
  );
  if (error) {
    console.error(`[platform-refund] couldn't credit organizer for transaction ${txn.id}; post the adjustment by hand:`, error.message);
    return 0;
  }
  return credit;
}
