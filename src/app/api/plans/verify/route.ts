import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizePaystackTransaction } from "@/lib/paystack";
import { requireOrgOwner } from "@/lib/plan-owner";

/** The Paystack callback for a plan payment lands on Settings → Plan, which
 *  calls this to finalize it (the webhook does the same; either order works). */
export async function GET(request: Request) {
  const auth = await requireOrgOwner(request);
  if ("response" in auth) return auth.response;
  const reference = new URL(request.url).searchParams.get("reference");
  if (!reference) return NextResponse.json({ error: "Missing reference." }, { status: 400 });

  const admin = createAdminClient();
  const { data: txn } = await admin.from("paystack_transactions").select("organization_id, purpose").eq("reference", reference).maybeSingle();
  if (!txn || txn.purpose !== "subscription" || txn.organization_id !== auth.org.id) {
    return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  }
  const result = await finalizePaystackTransaction(admin, reference);
  if (!result.ok) {
    const messages: Record<string, string> = {
      payment_failed: "This payment wasn't successful.",
      amount_mismatch: "This payment didn't match the plan price. Contact support.",
      verify_error: "Couldn't reach Paystack to confirm the payment. Refresh in a moment.",
      unknown_reference: "Payment not found.",
    };
    return NextResponse.json({ error: messages[result.reason] }, { status: 400 });
  }
  return NextResponse.json({ success: true, planId: result.purpose === "subscription" ? result.planId : null });
}
