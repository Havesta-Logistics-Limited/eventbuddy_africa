import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizePaystackTransaction } from "@/lib/paystack";

/**
 * Paystack calls this directly, server-to-server — no user session, so the signature
 * check below IS the entire trust boundary. Without it, anyone who found this URL
 * could POST a fake "charge.success" event and publish an event for free. Configure
 * this URL (yourdomain.com/api/paystack/webhook) in the Paystack dashboard under
 * Settings → API Keys & Webhooks.
 */
export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || secret === "paste_your_paystack_secret_key_here") {
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature") || "";
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");

  const signatureBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  const validSignature = signatureBuf.length === expectedBuf.length && timingSafeEqual(signatureBuf, expectedBuf);
  if (!validSignature) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let event: { event?: string; data?: { reference?: string } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  if (event.event === "charge.success" && event.data?.reference) {
    const admin = createAdminClient();
    // Idempotent — see finalizePaystackTransaction. Paystack redelivers webhooks on
    // timeout/non-2xx, and the browser callback (verify/route.ts) may already have
    // finalized this same reference; either order is safe.
    await finalizePaystackTransaction(admin, event.data.reference);
  }

  // Always acknowledge with 200 once the signature is valid, even for event types this
  // app doesn't act on — a non-2xx here makes Paystack retry unnecessarily.
  return NextResponse.json({ received: true });
}
