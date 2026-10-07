import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/validation";
import { emailApplicationReceived, emailOrganizerNewApplication } from "@/lib/exhibitors";

const Schema = z.object({
  eventId: z.string().uuid(),
  standTypeId: z.string().uuid(),
  companyName: z.string().trim().min(1, "Enter your company's name.").max(160),
  contactName: z.string().trim().min(2, "Enter the contact person's name.").max(120),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  phone: z.string().trim().max(30),
  website: z.string().trim().max(300).optional(),
  category: z.string().trim().max(80).optional(),
  description: z.string().trim().max(2000).optional(),
});

/** A company applies for a stand (migration 0112). Nothing is held until the
 *  organizer approves; a full stand type can't be applied for. */
export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the form and try again." }, { status: 400 });
  const d = parsed.data;
  const phone = normalizePhone(d.phone);
  if (!phone) return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  if (d.website && !/^https?:\/\/\S+\.\S+/.test(d.website)) return NextResponse.json({ error: "Enter the full website address, starting with https://" }, { status: 400 });
  if (!(await checkRateLimit(`exhibit-apply:ip:${clientIp(request)}`, 10, 60 * 60))) return rateLimitedResponse();
  if (!(await checkRateLimit(`exhibit-apply:email:${d.email.toLowerCase()}`, 5, 60 * 60))) return rateLimitedResponse();

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select("id, name, organization_id, published, exhibitors_enabled, exhibitor_deadline, organizations(email, is_suspended)")
    .eq("id", d.eventId)
    .maybeSingle();
  const org = event?.organizations as unknown as { email: string | null; is_suspended: boolean } | null;
  if (!event?.published || !event.exhibitors_enabled || org?.is_suspended) return NextResponse.json({ error: "This event isn't taking exhibitors." }, { status: 404 });
  if (event.exhibitor_deadline && new Date(`${event.exhibitor_deadline}T23:59:59`) < new Date()) {
    return NextResponse.json({ error: "Exhibitor applications for this event have closed." }, { status: 403 });
  }

  const { data: stands } = await admin.rpc("stand_availability", { p_event_id: event.id });
  const stand = ((stands ?? []) as { id: string; name: string; price_naira: number; quantity: number | null; taken: number }[]).find((s) => s.id === d.standTypeId);
  if (!stand) return NextResponse.json({ error: "That stand type isn't available." }, { status: 404 });
  if (stand.quantity != null && stand.taken >= stand.quantity) return NextResponse.json({ error: `${stand.name} stands are fully booked. Pick another stand type.` }, { status: 409 });

  const { data: dupe } = await admin
    .from("exhibitors")
    .select("id")
    .eq("event_id", event.id)
    .ilike("email", d.email)
    .in("status", ["applied", "approved", "paid"])
    .maybeSingle();
  if (dupe) return NextResponse.json({ error: "There's already an application from this email for this event. The organizer will be in touch." }, { status: 409 });

  const { error } = await admin.from("exhibitors").insert({
    organization_id: event.organization_id,
    event_id: event.id,
    stand_type_id: stand.id,
    company_name: d.companyName,
    contact_name: d.contactName,
    email: d.email,
    phone,
    website: d.website || null,
    category: d.category || null,
    description: d.description || null,
  });
  if (error) return NextResponse.json({ error: "Couldn't send your application. Please try again." }, { status: 500 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const ctx = { company: d.companyName, contact: d.contactName, eventName: event.name, standName: stand.name };
  await Promise.all([
    emailApplicationReceived(d.email, ctx),
    org?.email ? emailOrganizerNewApplication(org.email, { ...ctx, manageUrl: `${siteUrl}/events/${event.id}?tab=exhibitors` }) : Promise.resolve(false),
  ]);
  return NextResponse.json({ success: true });
}
