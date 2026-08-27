import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleRefundOrDispute } from "@/lib/paystack";

const Schema = z.object({ reference: z.string().min(1) });

/**
 * Manual reconciliation for a refund processed outside the automated webhook
 * path (e.g. an admin refunded directly from the Paystack dashboard before the
 * webhook was wired up, or a redelivery was somehow missed) — calls the exact
 * same handleRefundOrDispute logic the webhook uses, so the outcome (cancelled
 * registration, restored capacity, org notified) is identical either way.
 * Idempotent: calling this on an already-refunded transaction is a no-op.
 */
export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A transaction reference is required." }, { status: 400 });
  }

  const supabase = await createServerClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: membership } = await supabase.from("platform_admins").select("user_id").eq("user_id", caller.id).maybeSingle();
  if (!membership) return NextResponse.json({ error: "Only platform admins can do this." }, { status: 403 });

  const admin = createAdminClient();
  const result = await handleRefundOrDispute(admin, parsed.data.reference, "refunded");
  if (!result.handled) return NextResponse.json({ error: "No transaction found for that reference." }, { status: 404 });

  return NextResponse.json({ success: true });
}
