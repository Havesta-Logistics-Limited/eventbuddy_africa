import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizePaystackTransaction } from "@/lib/paystack";

const ERROR_MESSAGES: Record<string, string> = {
  unknown_reference: "We couldn't find that payment.",
  payment_failed: "This payment wasn't successful.",
  amount_mismatch: "This payment didn't match the amount owed — contact support.",
  verify_error: "Couldn't reach Paystack to verify this payment. Please try again in a moment.",
};

/**
 * Public counterpart to /api/paystack/verify — that route requires a signed-in org
 * admin (it's for the event-publish flow), but a ticket buyer has no session at all.
 * The unguessable `reference` itself is the trust boundary here, same as a
 * registration's reference_id: knowing it is proof enough, and it's never brute-
 * forceable (newId's random suffix). Scoped to purpose = 'ticket_purchase' so this
 * can never be used to finalize an event-publish transaction instead.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("reference");
  if (!reference) {
    return NextResponse.json({ error: "Missing reference." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: txn } = await admin.from("paystack_transactions").select("id, purpose").eq("reference", reference).maybeSingle();
  if (!txn || txn.purpose !== "ticket_purchase") {
    return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
  }

  const result = await finalizePaystackTransaction(admin, reference);
  if (!result.ok) {
    return NextResponse.json({ success: false, error: ERROR_MESSAGES[result.reason] || "Couldn't verify payment." });
  }
  return NextResponse.json({ success: true, referenceId: result.purpose === "ticket_purchase" ? result.referenceId : null });
}
