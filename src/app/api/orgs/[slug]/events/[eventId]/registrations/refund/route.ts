import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { paystackRefund, sendAttendeeRefundEmail, handleRefundOrDispute } from "@/lib/paystack";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { resolveOrgAccess } from "@/lib/org-access";

type Body = { registrationId?: string };

/**
 * Organizer self-service refund — actually reverses the charge on Paystack (unlike
 * /api/platform/manual-refund, which only reconciles a refund that already happened
 * externally). Scoped to physical-event registrations only: a paid ticket's
 * paystack_transactions row only gets linked back (registration_id) for the
 * `registrations` table (see createTicketPurchaseRegistration in paystack.ts) —
 * virtual-event paid leads have no such linkage yet, so there's nothing here to look
 * up a transaction from for them. Always a full refund of the original amount.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[slug]/events/[eventId]/registrations/refund">) {
  const { slug, eventId } = await ctx.params;
  const body = (await request.json().catch(() => null)) as Body | null;
  const registrationId = body?.registrationId;
  if (!registrationId) return NextResponse.json({ error: "Missing registration ID." }, { status: 400 });

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!(await checkRateLimit(`refund:user:${user.id}`, 20, 10 * 60))) {
    return rateLimitedResponse();
  }

  const org = await resolveOrgAccess(supabase, user.id, slug);
  if (!org) return NextResponse.json({ error: "Not authorized for this organization." }, { status: 403 });
  if (org.role === "event_support" && org.eventId !== eventId) {
    return NextResponse.json({ error: "Not authorized for this event." }, { status: 403 });
  }

  const { data: event } = await supabase.from("events").select("id, name").eq("id", eventId).eq("organization_id", org.id).maybeSingle();
  if (!event) return NextResponse.json({ error: "This event couldn't be found." }, { status: 404 });

  const admin = createAdminClient();
  const { data: registration } = await admin
    .from("registrations")
    .select("id, email, status")
    .eq("id", registrationId)
    .eq("event_id", event.id)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!registration) return NextResponse.json({ error: "Registration not found." }, { status: 404 });
  if (registration.status === "cancelled" || registration.status === "declined") {
    return NextResponse.json({ error: "This registration is already cancelled." }, { status: 400 });
  }

  const { data: txn } = await admin
    .from("paystack_transactions")
    .select("reference, amount_naira")
    .eq("registration_id", registration.id)
    .eq("status", "success")
    .maybeSingle();
  if (!txn) return NextResponse.json({ error: "No successful paid transaction found for this registration — nothing to refund." }, { status: 400 });

  try {
    await paystackRefund(txn.reference);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Paystack couldn't process this refund." }, { status: 502 });
  }

  await handleRefundOrDispute(admin, txn.reference, "refunded");
  const emailSent = await sendAttendeeRefundEmail(registration.email, event.name, Number(txn.amount_naira));

  return NextResponse.json({ success: true, emailSent });
}
