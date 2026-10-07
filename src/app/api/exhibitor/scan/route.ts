import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPortal } from "@/lib/exhibitors";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";

const Schema = z.object({ token: z.string(), code: z.string().trim().min(4).max(200), capturedBy: z.string().trim().max(120).optional() });

/** Stand staff scan a visitor's ticket QR: the visitor becomes one of the
 *  exhibitor's leads (once; a repeat scan just shows them again). */
export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That isn't a ticket code." }, { status: 400 });
  if (!(await checkRateLimit(`exhibitor-scan:ip:${clientIp(request)}`, 600, 60 * 60))) return rateLimitedResponse();
  const admin = createAdminClient();
  const x = await loadPortal(admin, parsed.data.token);
  if (!x) return NextResponse.json({ error: "This portal link isn't valid." }, { status: 404 });
  if (x.status !== "paid") return NextResponse.json({ error: "Lead scanning opens once your stand is confirmed." }, { status: 403 });

  const ref = parsed.data.code.toUpperCase();
  const { data: reg } = await admin
    .from("registrations")
    .select("id, full_name, email, phone, status, exhibitor_id")
    .eq("event_id", x.event_id)
    .eq("reference_id", ref)
    .maybeSingle();
  if (!reg || ["cancelled", "declined"].includes(reg.status)) return NextResponse.json({ error: "No ticket for this event matches that code." }, { status: 404 });
  if (reg.exhibitor_id === x.id) return NextResponse.json({ error: "That's one of your own staff passes." }, { status: 409 });

  const { data: existing } = await admin.from("exhibitor_leads").select("id, rating, notes").eq("exhibitor_id", x.id).eq("registration_id", reg.id).maybeSingle();
  let leadId = existing?.id;
  if (!existing) {
    const { data, error } = await admin
      .from("exhibitor_leads")
      .insert({ organization_id: x.organization_id, event_id: x.event_id, exhibitor_id: x.id, registration_id: reg.id, captured_by: parsed.data.capturedBy || null })
      .select("id")
      .single();
    if (error || !data) return NextResponse.json({ error: "Couldn't save this lead. Try again." }, { status: 500 });
    leadId = data.id;
  }
  return NextResponse.json({
    duplicate: !!existing,
    lead: { id: leadId, name: reg.full_name, email: reg.email, phone: reg.phone, rating: existing?.rating ?? null, notes: existing?.notes ?? "" },
  });
}
