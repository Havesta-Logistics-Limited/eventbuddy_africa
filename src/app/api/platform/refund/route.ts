import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleRefundOrDispute, paystackRefund, sendAttendeeRefundEmail } from "@/lib/paystack";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { recordPlatformRefund } from "@/lib/platform-refund";

/**
 * Platform admin refund: actually reverses the charge on Paystack (unlike
 * /api/platform/manual-refund, which only records one done elsewhere), then
 * runs the same handleRefundOrDispute as the webhook and the organizer's own
 * refund button: ticket or stand cancelled, capacity restored, organizer
 * emailed, held balance debited, promoter commission reversed. Full amount only.
 *
 * Held funds: by default the organizer's balance carries the refund, as when
 * they refund themselves. `absorb: "eventbuddy"` instead credits it back to
 * them (an adjustment), so eventbuddy carries it: for when they've already
 * been paid out, or the refund is eventbuddy's call.
 *
 * GET ?reference= returns what the confirmation dialog shows. Platform admins
 * only, with two-factor when they've set it up (is_platform_admin()).
 */

async function authorize() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  const { data: ok } = await supabase.rpc("is_platform_admin");
  if (!ok) return { response: NextResponse.json({ error: "Only platform admins can refund payments." }, { status: 403 }) };
  return { userId: user.id };
}

type Txn = {
  id: string; reference: string; organization_id: string; event_id: string; amount_naira: number | string; status: string; purpose: string;
  settlement: string | null; created_at: string; registration_id: string | null; exhibitor_id: string | null;
  registrant_data: { email?: string; full_name?: string } | null; paystack_event: { domain?: string } | null; platform_fee_naira: number | string | null;
};

async function loadDetails(reference: string) {
  const admin = createAdminClient();
  const { data: txn } = await admin.from("paystack_transactions").select("*").eq("reference", reference).maybeSingle<Txn>();
  if (!txn) return null;
  const [{ data: org }, { data: event }, { data: ledger }, { data: commission }, regRes, exRes] = await Promise.all([
    admin.from("organizations").select("id, name, email, payout_verified").eq("id", txn.organization_id).maybeSingle(),
    admin.from("events").select("name").eq("id", txn.event_id).maybeSingle(),
    admin.from("ledger_entries").select("amount_naira").eq("organization_id", txn.organization_id).is("promoter_id", null),
    admin.from("ledger_entries").select("amount_naira, promoters(handle)").eq("transaction_id", txn.id).eq("kind", "commission_earned").maybeSingle(),
    txn.registration_id
      ? admin.from("registrations").select("full_name, email").eq("id", txn.registration_id).maybeSingle()
      : Promise.resolve({ data: null }),
    txn.exhibitor_id
      ? admin.from("exhibitors").select("company_name, email").eq("id", txn.exhibitor_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const reg = regRes.data as { full_name: string | null; email: string | null } | null;
  const ex = exRes.data as { company_name: string; email: string | null } | null;
  const groupSize = txn.registration_id
    ? ((await admin.from("registrations").select("id", { count: "exact", head: true }).eq("group_lead_id", txn.registration_id)).count ?? 0) + 1
    : 1;
  const balance = (ledger ?? []).reduce((s, r) => s + Number(r.amount_naira), 0);
  const amount = Number(txn.amount_naira);
  return {
    txn,
    view: {
      reference: txn.reference,
      amount_naira: amount,
      fee_naira: Number(txn.platform_fee_naira ?? 0),
      status: txn.status,
      purpose: txn.purpose,
      held: txn.settlement === "held",
      test: txn.paystack_event?.domain === "test",
      created_at: txn.created_at,
      buyer: ex?.company_name ?? reg?.full_name ?? txn.registrant_data?.full_name ?? null,
      buyer_email: ex?.email ?? reg?.email ?? txn.registrant_data?.email ?? null,
      group_size: groupSize,
      event: event?.name ?? null,
      organization: org ? { id: org.id, name: org.name, email: org.email, verified: org.payout_verified } : null,
      organizer_balance_naira: balance,
      organizer_already_paid_out: txn.settlement === "held" && balance < amount,
      promoter_commission: commission
        ? { naira: Number(commission.amount_naira), handle: (commission.promoters as unknown as { handle: string } | null)?.handle ?? null }
        : null,
      refundable: txn.status === "success" && (txn.purpose === "ticket_purchase" || txn.purpose === "stand_booking"),
    },
  };
}

export async function GET(request: Request) {
  const auth = await authorize();
  if ("response" in auth) return auth.response;
  const reference = new URL(request.url).searchParams.get("reference")?.trim();
  if (!reference) return NextResponse.json({ error: "A payment reference is required." }, { status: 400 });
  const d = await loadDetails(reference);
  if (!d) return NextResponse.json({ error: "No payment found with that reference." }, { status: 404 });
  return NextResponse.json(d.view);
}

const Schema = z.object({
  reference: z.string().min(1),
  absorb: z.enum(["organizer", "eventbuddy"]),
  reason: z.string().trim().min(3, "Add a short reason (at least 3 characters).").max(300),
});

export async function POST(request: Request) {
  const auth = await authorize();
  if ("response" in auth) return auth.response;
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the refund details." }, { status: 400 });
  if (!(await checkRateLimit(`platform-refund:user:${auth.userId}`, 20, 10 * 60))) return rateLimitedResponse();

  const { reference, absorb, reason } = parsed.data;
  const d = await loadDetails(reference);
  if (!d) return NextResponse.json({ error: "No payment found with that reference." }, { status: 404 });
  if (!d.view.refundable) {
    return NextResponse.json({ error: d.txn.status === "success" ? "Only ticket and stand payments can be refunded here." : `This payment is ${d.txn.status}, so there's nothing to refund.` }, { status: 400 });
  }

  try {
    await paystackRefund(reference);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Paystack couldn't process this refund." }, { status: 502 });
  }

  const admin = createAdminClient();
  await handleRefundOrDispute(admin, reference, "refunded");

  // who refunded and why, and (if eventbuddy carries it) the organizer's credit
  const amount = d.view.amount_naira;
  await recordPlatformRefund(admin, d.txn, absorb, reason, auth.userId);
  console.log(`[platform-refund] ${reference} ₦${amount} refunded by ${auth.userId} (${absorb}): ${reason}`);

  const emailSent = d.view.buyer_email && d.view.event ? await sendAttendeeRefundEmail(d.view.buyer_email, d.view.event, amount, "eventbuddy") : false;
  return NextResponse.json({ success: true, emailSent });
}
