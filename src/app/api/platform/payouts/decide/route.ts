import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { createTransferRecipient, initiateTransfer } from "@/lib/paystack";
import { newId } from "@/lib/utils";

const Schema = z.object({
  payoutId: z.string().uuid(),
  // transfer: send now through Paystack Transfers
  // mark_paid: already paid by hand (bank app), just record it
  // reject: return the money to the organizer's balance
  action: z.enum(["transfer", "mark_paid", "reject"]),
  note: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if ("response" in auth) return auth.response;
  const parsed = Schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  const { payoutId, action, note } = parsed.data;

  const admin = createAdminClient();
  const { data: payout } = await admin.from("payout_requests").select("*").eq("id", payoutId).maybeSingle();
  if (!payout) return NextResponse.json({ error: "Payout not found." }, { status: 404 });
  // a "processing" payout whose transfer call failed can still be settled by
  // hand (marked paid once checked in Paystack, or rejected); only a new
  // request can be sent through Paystack
  const settleable = payout.status === "requested" || (payout.status === "processing" && action !== "transfer");
  if (!settleable) return NextResponse.json({ error: `This payout is already ${payout.status}.` }, { status: 409 });

  if (action === "reject") {
    if (!note) return NextResponse.json({ error: "Give the organizer a reason for rejecting this payout." }, { status: 400 });
    const { error } = await admin.rpc("return_payout", { p_payout: payoutId, p_status: "rejected", p_note: note, p_by: auth.userId });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, status: "rejected" });
  }

  if (action === "mark_paid") {
    const { data: updated } = await admin
      .from("payout_requests")
      .update({ status: "paid", paid_at: new Date().toISOString(), decided_by: auth.userId, decided_at: new Date().toISOString(), decision_note: note || "Paid manually" })
      .eq("id", payoutId)
      .in("status", ["requested", "processing"])
      .select("id")
      .maybeSingle();
    if (!updated) return NextResponse.json({ error: "This payout changed while you were looking at it. Refresh and try again." }, { status: 409 });
    return NextResponse.json({ success: true, status: "paid" });
  }

  // transfer: the account is an organization's or a promoter's (migration 0105)
  const accountTable = payout.promoter_id ? "promoters" : "organizations";
  const { data: account } = await admin
    .from(accountTable)
    .select(`id, ${payout.promoter_id ? "full_name" : "name"}, payout_bank_code, payout_account_number, payout_account_name, payout_recipient_code, payout_change_status`)
    .eq("id", payout.promoter_id ?? payout.organization_id)
    .maybeSingle();
  const org = account as unknown as {
    id: string;
    name?: string;
    full_name?: string;
    payout_bank_code: string | null;
    payout_account_number: string | null;
    payout_account_name: string | null;
    payout_recipient_code: string | null;
    payout_change_status: string;
  } | null;
  const accountName = org?.name ?? org?.full_name ?? "account";
  if (!org?.payout_account_number || !org.payout_bank_code) return NextResponse.json({ error: "This account has no bank details on file." }, { status: 400 });
  if (org.payout_change_status === "requested") {
    return NextResponse.json({ error: "This account has a bank change waiting. Resolve it before sending money." }, { status: 409 });
  }

  // Claim the payout first so a double click can't send two transfers. A
  // retry reuses the earlier reference: if a previous attempt actually reached
  // Paystack, Paystack refuses the duplicate instead of paying twice.
  const reference: string = payout.transfer_reference || newId("payout");
  const { data: claimed } = await admin
    .from("payout_requests")
    .update({ status: "processing", transfer_reference: reference, decided_by: auth.userId, decided_at: new Date().toISOString(), decision_note: note || null })
    .eq("id", payoutId)
    .eq("status", "requested")
    .select("id")
    .maybeSingle();
  if (!claimed) return NextResponse.json({ error: "This payout changed while you were looking at it. Refresh and try again." }, { status: 409 });

  try {
    let recipientCode = org.payout_recipient_code;
    if (!recipientCode) {
      ({ recipientCode } = await createTransferRecipient({ name: org.payout_account_name || accountName, accountNumber: org.payout_account_number, bankCode: org.payout_bank_code }));
      await admin.from(accountTable).update({ payout_recipient_code: recipientCode }).eq("id", org.id);
    }
    const { transferCode, status } = await initiateTransfer({
      amountMinor: Math.round(Number(payout.amount_naira) * 100),
      recipientCode: recipientCode!,
      reference,
      reason: `eventbuddy payout to ${accountName}`,
    });
    await admin.from("payout_requests").update({ transfer_code: transferCode, ...(status === "success" ? { status: "paid", paid_at: new Date().toISOString() } : {}) }).eq("id", payoutId);
    return NextResponse.json({ success: true, status: status === "success" ? "paid" : "processing" });
  } catch (err) {
    // The call failed, but Paystack may still have accepted the transfer (a
    // timeout after it was sent). Resetting to "requested" would let the
    // organizer cancel and get the money back while it's also being paid, so
    // the request stays "processing": check it in the Paystack dashboard, then
    // mark it paid, or reject it to return the money.
    await admin.from("payout_requests").update({ failure_reason: `Transfer call failed, check Paystack before retrying: ${err instanceof Error ? err.message : "unknown error"}` }).eq("id", payoutId).eq("status", "processing");
    return NextResponse.json({ error: "Paystack didn't confirm this transfer. It's left as processing: check the Paystack dashboard, then mark it paid or reject it." }, { status: 502 });
  }
}
