import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePromoter } from "@/lib/promoter-auth";
import { resolvePaystackAccount } from "@/lib/paystack";

const Schema = z.object({
  action: z.enum(["resolve", "save", "request-change"]),
  bankCode: z.string().optional(),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
});

/** A promoter's payout bank account: resolve (shows the real account name),
 *  save (first time, or once a platform admin approves a change), and
 *  request-change. Same rules as organizer payouts. */
export async function POST(request: Request) {
  const auth = await requirePromoter(request);
  if ("response" in auth) return auth.response;
  const parsed = Schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  const { action, bankCode, bankName, accountNumber } = parsed.data;
  const { promoter } = auth;
  const admin = createAdminClient();

  if (action === "request-change") {
    if (!promoter.payout_account_number) return NextResponse.json({ error: "You haven't added a bank account yet." }, { status: 400 });
    const { error } = await admin.from("promoters").update({ payout_change_status: "requested", payout_change_requested_at: new Date().toISOString() }).eq("id", promoter.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (!bankCode || !bankName || !accountNumber?.trim()) return NextResponse.json({ error: "Missing bank details." }, { status: 400 });
  if (promoter.payout_account_number && promoter.payout_change_status !== "approved") {
    return NextResponse.json({ error: "Request a bank change and wait for approval before updating your bank details." }, { status: 403 });
  }
  let accountName: string;
  try {
    ({ accountName } = await resolvePaystackAccount(accountNumber.trim(), bankCode));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't verify that account number." }, { status: 502 });
  }
  if (action === "resolve") return NextResponse.json({ accountName });

  const { error } = await admin
    .from("promoters")
    .update({
      payout_bank_code: bankCode,
      payout_bank_name: bankName,
      payout_account_number: accountNumber.trim(),
      payout_account_name: accountName,
      payout_recipient_code: null,
      payout_change_status: "none",
    })
    .eq("id", promoter.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, accountName });
}
