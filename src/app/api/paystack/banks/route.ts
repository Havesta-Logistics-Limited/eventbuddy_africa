import { NextResponse } from "next/server";
import { resolveRouteUser } from "@/lib/supabase/route-auth";
import { listPaystackBanks } from "@/lib/paystack";

/**
 * Proxies Paystack's bank list for the payout-onboarding dropdown — PAYSTACK_SECRET_KEY
 * can't be used client-side, so this thin server route is the only way the browser can
 * get it. Gated behind a signed-in session purely to keep it from being an open proxy
 * for the platform's Paystack key; the bank list itself isn't sensitive. Also callable
 * from the mobile app via a bearer token (see resolveRouteUser).
 */
export async function GET(request: Request) {
  const { user } = await resolveRouteUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  try {
    const banks = await listPaystackBanks();
    return NextResponse.json({ banks });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't load banks." }, { status: 502 });
  }
}
