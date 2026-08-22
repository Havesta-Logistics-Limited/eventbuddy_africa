import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizePaystackTransaction } from "@/lib/paystack";

const ERROR_MESSAGES: Record<string, string> = {
  unknown_reference: "We couldn't find that payment.",
  payment_failed: "This payment wasn't successful.",
  amount_mismatch: "This payment didn't match the amount owed — contact support.",
  verify_error: "Couldn't reach Paystack to verify this payment. Please try again in a moment.",
};

/**
 * Called client-side the moment Paystack redirects the browser back after checkout —
 * gives the admin an immediate result instead of waiting on the webhook, which can lag
 * by a few seconds. Shares the exact same idempotent finalize path as the webhook
 * below, so whichever of the two runs first does the real work and the other is a
 * harmless no-op.
 */
export async function GET(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("reference");
  if (!reference) {
    return NextResponse.json({ error: "Missing reference." }, { status: 400 });
  }

  // RLS-scoped select — confirms the caller's own organization actually owns this
  // transaction before finalizing on their behalf, same trust boundary as initialize.
  const { data: txn } = await supabase.from("paystack_transactions").select("id").eq("reference", reference).maybeSingle();
  if (!txn) {
    return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
  }

  const admin = createAdminClient();
  const result = await finalizePaystackTransaction(admin, reference);
  if (!result.ok) {
    return NextResponse.json({ success: false, error: ERROR_MESSAGES[result.reason] || "Couldn't verify payment." });
  }
  return NextResponse.json({ success: true, eventId: result.eventId });
}
