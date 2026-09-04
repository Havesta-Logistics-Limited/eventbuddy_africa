import type { SupabaseClient } from "@supabase/supabase-js";

/** Atomic, capacity-guarded increment (see 0038_atomic_ticket_discount_counters.sql)
 *  — a plain read-then-write would let two concurrent registrations for the last
 *  unit of a capacity-limited ticket both pass the availability check and both
 *  succeed. Returns whether a seat was actually reserved — callers must branch on
 *  this (waitlist/reject), not just log it, or capacity-limited free tickets get
 *  oversold. Shared by the free-registration route and the pending/waitlist
 *  approve-decline-promote route. */
export async function incrementTicketQuantitySold(supabase: SupabaseClient, ticketTypeId: string): Promise<boolean> {
  const { data: incremented, error } = await supabase.rpc("increment_ticket_sold", { p_ticket_type_id: ticketTypeId });
  if (error) {
    console.error(`[ticket-capacity] couldn't increment quantity_sold for ticket ${ticketTypeId}:`, error.message);
    return false;
  }
  return Boolean(incremented);
}

/** Counterpart used when a reservation ends up not becoming (or no longer being) a
 *  real registration — declining a pending registration, or a reference-ID retry
 *  loop exhausting itself — frees the seat back. */
export async function decrementTicketQuantitySold(supabase: SupabaseClient, ticketTypeId: string) {
  const { error } = await supabase.rpc("decrement_ticket_sold", { p_ticket_type_id: ticketTypeId });
  if (error) console.error(`[ticket-capacity] couldn't decrement quantity_sold for ticket ${ticketTypeId}:`, error.message);
}
