import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPortal } from "@/lib/exhibitors";
import { generateReferenceId } from "@/lib/utils";
import { sendRegistrationEmail } from "@/lib/registration-email";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";

const Add = z.object({ token: z.string(), fullName: z.string().trim().min(2, "Enter the person's full name.").max(120), email: z.string().trim().email("Enter a valid email.").max(254).optional().or(z.literal("")) });
const Remove = z.object({ token: z.string(), referenceId: z.string().min(4).max(40) });

/** A paid exhibitor names a staff pass: a registration on the event (source
 *  'exhibitor'), so its QR gets them in at the door like a ticket. */
export async function POST(request: Request) {
  const parsed = Add.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the details." }, { status: 400 });
  if (!(await checkRateLimit(`exhibitor-pass:ip:${clientIp(request)}`, 60, 60 * 60))) return rateLimitedResponse();
  const admin = createAdminClient();
  const x = await loadPortal(admin, parsed.data.token);
  if (!x) return NextResponse.json({ error: "This portal link isn't valid." }, { status: 404 });
  if (x.status !== "paid") return NextResponse.json({ error: "Passes open once your stand is confirmed." }, { status: 403 });

  const { count } = await admin.from("registrations").select("id", { count: "exact", head: true }).eq("exhibitor_id", x.id).neq("status", "cancelled");
  if ((count ?? 0) >= x.passesIncluded) {
    return NextResponse.json({ error: `Your ${x.standName} includes ${x.passesIncluded} pass${x.passesIncluded === 1 ? "" : "es"}. Ask the organizer if you need more.` }, { status: 409 });
  }

  const email = parsed.data.email || x.email;
  let pass: { reference_id: string; full_name: string; email: string } | null = null;
  for (let attempt = 0; attempt < 5 && !pass; attempt++) {
    const { data, error } = await admin
      .from("registrations")
      .insert({
        organization_id: x.organization_id,
        event_id: x.event_id,
        exhibitor_id: x.id,
        reference_id: generateReferenceId(),
        full_name: parsed.data.fullName,
        email,
        source: "exhibitor",
        status: "registered",
        custom_answers: { company: x.company_name },
        hide_from_guest_list: true,
      })
      .select("reference_id, full_name, email")
      .single();
    if (data) pass = data;
    else if (error?.code !== "23505") return NextResponse.json({ error: error?.message || "Couldn't create the pass." }, { status: 500 });
  }
  if (!pass) return NextResponse.json({ error: "Couldn't create the pass. Please try again." }, { status: 500 });
  const emailed = await sendRegistrationEmail(email, pass.reference_id, x.event).catch(() => false);
  return NextResponse.json({ success: true, referenceId: pass.reference_id, emailed });
}

/** Removes a staff pass that hasn't been used at the door yet. */
export async function DELETE(request: Request) {
  const parsed = Remove.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const admin = createAdminClient();
  const x = await loadPortal(admin, parsed.data.token);
  if (!x || x.status !== "paid") return NextResponse.json({ error: "This portal link isn't valid." }, { status: 404 });
  const { data } = await admin
    .from("registrations")
    .update({ status: "cancelled" })
    .eq("exhibitor_id", x.id)
    .eq("reference_id", parsed.data.referenceId)
    .is("checked_in_at", null)
    .select("id");
  if (!data?.length) return NextResponse.json({ error: "That pass has already been used, so it can't be removed." }, { status: 409 });
  return NextResponse.json({ success: true });
}
