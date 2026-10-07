import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizePaystackTransaction } from "@/lib/paystack";

const Schema = z.object({ reference: z.string().min(6).max(120) });

/** Paystack sent the exhibitor back: confirm the payment now rather than
 *  waiting for the webhook (both are safe to run; finalize is idempotent). */
export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid reference." }, { status: 400 });
  const admin = createAdminClient();
  const { data: txn } = await admin.from("paystack_transactions").select("purpose").eq("reference", parsed.data.reference).maybeSingle();
  if (txn?.purpose !== "stand_booking") return NextResponse.json({ error: "Unknown payment." }, { status: 404 });
  const result = await finalizePaystackTransaction(admin, parsed.data.reference);
  if (!result.ok) return NextResponse.json({ ok: false, reason: result.reason }, { status: 402 });
  return NextResponse.json({ ok: true });
}
