import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { formatNaira, planTicketFee, ticketFeeFromSettings, ticketFeeMinor } from "@/lib/billing";
import { emailButton, escapeHtml, renderEmailShell } from "@/lib/email-template";

/** Exhibitors, phase 1 (migration 0112): companies apply for a stand, the
 *  organizer approves or declines, approved exhibitors pay through Paystack. */

export type ExhibitorStatus = "applied" | "approved" | "declined" | "paid" | "cancelled";

/** eventbuddy's fee on a stand booking: the organizer's plan rate, the same
 *  as a ticket, read live. Fee-exempt organizations pay nothing. */
export async function standFeeMinor(admin: SupabaseClient, org: { id: string; is_fee_exempt?: boolean | null }, amountNaira: number): Promise<number> {
  if (org.is_fee_exempt) return 0;
  const { data: settings } = await admin.from("platform_settings").select("ticket_fee_percentage, ticket_fee_flat_naira").eq("id", true).maybeSingle();
  const { data: planId } = await admin.rpc("effective_plan_id", { p_org: org.id });
  const { data: plan } = await admin.from("organizer_plans").select("fee_percentage, fee_flat_naira").eq("id", planId ?? "launch").maybeSingle();
  return ticketFeeMinor(amountNaira, planTicketFee(plan, ticketFeeFromSettings(settings)), 1);
}

export function exhibitPayUrl(siteUrl: string, token: string) {
  return `${siteUrl.replace(/\/$/, "")}/exhibit/pay/${token}`;
}

/** The exhibitor's portal (0113): staff passes and lead capture. Anyone with
 *  the link can use it, so it goes to the exhibitor's contact only. */
export function exhibitorPortalUrl(siteUrl: string, token: string) {
  return `${siteUrl.replace(/\/$/, "")}/exhibitor/${token}`;
}

const PINK = "#C21FAF";

async function send(to: string | string[], subject: string, text: string, banner: { label: string; emoji: string }, body: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;
  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject,
      text,
      html: renderEmailShell({ color: PINK, ...banner }, body),
    });
    return !error;
  } catch {
    return false;
  }
}

type Ctx = { company: string; contact: string; eventName: string; standName: string; price?: number };

export function emailApplicationReceived(to: string, c: Ctx) {
  return send(
    to,
    `We've received your exhibitor application: ${c.eventName}`,
    `Hi ${c.contact}, ${c.company}'s application for a ${c.standName} at ${c.eventName} is with the organizer. You'll get an email when they decide.`,
    { label: "Application received", emoji: "📝" },
    `<p style="margin:0 0 14px;">Hi ${escapeHtml(c.contact)},</p>
     <p style="margin:0 0 14px;">Thanks for applying to exhibit at <strong>${escapeHtml(c.eventName)}</strong>. ${escapeHtml(c.company)}'s application for a <strong>${escapeHtml(c.standName)}</strong> is now with the organizer.</p>
     <p style="margin:0;">You'll get an email as soon as they decide. If you're approved, it will include a link to pay for your stand.</p>`
  );
}

export function emailOrganizerNewApplication(to: string, c: Ctx & { manageUrl: string }) {
  return send(
    to,
    `New exhibitor application: ${c.company}`,
    `${c.company} applied for a ${c.standName} at ${c.eventName}. Review it: ${c.manageUrl}`,
    { label: "New exhibitor", emoji: "🏢" },
    `<p style="margin:0 0 14px;"><strong>${escapeHtml(c.company)}</strong> (${escapeHtml(c.contact)}) applied for a <strong>${escapeHtml(c.standName)}</strong> at ${escapeHtml(c.eventName)}.</p>
     <p style="margin:0 0 20px;">Approve it to send them a payment link, or decline with a reason.</p>
     ${emailButton(c.manageUrl, "Review the application", PINK)}`
  );
}

export function emailApproved(to: string, c: Ctx & { payUrl: string }) {
  return send(
    to,
    `You're approved to exhibit at ${c.eventName}`,
    `Hi ${c.contact}, ${c.company} is approved for a ${c.standName} at ${c.eventName}. Pay ${formatNaira(c.price ?? 0)} to confirm your stand: ${c.payUrl}`,
    { label: "Approved", emoji: "🎉" },
    `<p style="margin:0 0 14px;">Hi ${escapeHtml(c.contact)},</p>
     <p style="margin:0 0 14px;">Good news: <strong>${escapeHtml(c.company)}</strong> is approved to exhibit at <strong>${escapeHtml(c.eventName)}</strong>.</p>
     <p style="margin:0 0 20px;">Your stand: <strong>${escapeHtml(c.standName)}</strong>, ${escapeHtml(formatNaira(c.price ?? 0))}. Pay to confirm it; your stand is held for you meanwhile.</p>
     ${emailButton(c.payUrl, "Pay for my stand", PINK)}`
  );
}

export function emailDeclined(to: string, c: Ctx & { reason: string }) {
  return send(
    to,
    `Your exhibitor application for ${c.eventName}`,
    `Hi ${c.contact}, the organizer of ${c.eventName} couldn't accept ${c.company}'s application this time. Their note: ${c.reason}`,
    { label: "Application update", emoji: "✉️" },
    `<p style="margin:0 0 14px;">Hi ${escapeHtml(c.contact)},</p>
     <p style="margin:0 0 14px;">The organizer of <strong>${escapeHtml(c.eventName)}</strong> couldn't accept ${escapeHtml(c.company)}'s application this time.</p>
     <p style="margin:0;">Their note: ${escapeHtml(c.reason)}</p>`
  );
}

export function emailPaid(to: string | string[], c: Ctx & { standLabel?: string | null; portalUrl?: string }) {
  return send(
    to,
    `Stand confirmed: ${c.company} at ${c.eventName}`,
    `${c.company}'s ${c.standName} at ${c.eventName} is paid and confirmed (${formatNaira(c.price ?? 0)}).`,
    { label: "Stand confirmed", emoji: "✅" },
    `<p style="margin:0 0 14px;"><strong>${escapeHtml(c.company)}</strong>'s stand at <strong>${escapeHtml(c.eventName)}</strong> is paid and confirmed.</p>
     <p style="margin:0 0 6px;">Stand: ${escapeHtml(c.standName)}${c.standLabel ? ` (${escapeHtml(c.standLabel)})` : ""}</p>
     <p style="margin:0 0 20px;">Paid: ${escapeHtml(formatNaira(c.price ?? 0))}</p>
     ${c.portalUrl ? `<p style="margin:0 0 14px;">Your exhibitor portal is ready: add your staff passes (each gets a QR to get in) and scan visitors' tickets at your stand to collect leads.</p>${emailButton(c.portalUrl, "Open my exhibitor portal", PINK)}` : ""}`
  );
}

export function emailPortalLink(to: string, c: Ctx & { portalUrl: string }) {
  return send(
    to,
    `Your exhibitor portal for ${c.eventName}`,
    `Hi ${c.contact}, here's ${c.company}'s exhibitor portal for ${c.eventName}: ${c.portalUrl}`,
    { label: "Exhibitor portal", emoji: "🏢" },
    `<p style="margin:0 0 14px;">Hi ${escapeHtml(c.contact)},</p>
     <p style="margin:0 0 14px;">Here's <strong>${escapeHtml(c.company)}</strong>'s exhibitor portal for <strong>${escapeHtml(c.eventName)}</strong>. Add your staff passes there, and on the day, scan visitors' tickets at your stand to collect leads.</p>
     <p style="margin:0 0 20px;">Anyone with this link can use it, so share it only with your team.</p>
     ${emailButton(c.portalUrl, "Open my exhibitor portal", PINK)}`
  );
}

// ---- portal (0113): everything below is keyed by the exhibitor's portal link ----

export type PortalExhibitor = {
  id: string;
  organization_id: string;
  event_id: string;
  status: ExhibitorStatus;
  company_name: string;
  contact_name: string;
  email: string;
  stand_label: string | null;
  pay_token: string;
  passesIncluded: number;
  standName: string;
  event: {
    id: string;
    slug: string | null;
    name: string;
    date: string;
    end_date: string | null;
    start_time: string | null;
    end_time: string | null;
    event_format: string | null;
    virtual_join_url: string | null;
    virtual_platform: string | null;
    virtual_access_notes: string | null;
    venue: string;
    location: string;
  };
};

/** Loads the exhibitor a portal link belongs to, or null if the link is unknown. */
export async function loadPortal(admin: SupabaseClient, token: string | null | undefined): Promise<PortalExhibitor | null> {
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return null;
  const { data } = await admin
    .from("exhibitors")
    .select(
      "id, organization_id, event_id, status, company_name, contact_name, email, stand_label, pay_token, stand_types(name, passes_included), events(id, slug, name, date, end_date, start_time, end_time, event_format, virtual_join_url, virtual_platform, virtual_access_notes, venue, location)"
    )
    .eq("portal_token", token)
    .maybeSingle();
  if (!data) return null;
  const st = data.stand_types as unknown as { name: string; passes_included: number } | null;
  return {
    ...(data as unknown as Omit<PortalExhibitor, "passesIncluded" | "standName" | "event">),
    passesIncluded: Number(st?.passes_included ?? 0),
    standName: st?.name ?? "Stand",
    event: data.events as unknown as PortalExhibitor["event"],
  };
}

export function emailLeadsExpiring(to: string, c: { company: string; contact: string; eventName: string; leadCount: number; deleteOn: string; portalUrl: string }) {
  const when = new Date(`${c.deleteOn}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return send(
    to,
    `Download your ${c.eventName} leads before ${when}`,
    `Hi ${c.contact}, ${c.company}'s ${c.leadCount} leads from ${c.eventName} will be deleted on ${when}. Export them from your portal before then: ${c.portalUrl}`,
    { label: "Leads expiring", emoji: "⏳" },
    `<p style="margin:0 0 14px;">Hi ${escapeHtml(c.contact)},</p>
     <p style="margin:0 0 14px;">To protect visitors' privacy, the <strong>${c.leadCount} lead${c.leadCount === 1 ? "" : "s"}</strong> ${escapeHtml(c.company)} collected at <strong>${escapeHtml(c.eventName)}</strong> will be deleted on <strong>${escapeHtml(when)}</strong>, 90 days after the event.</p>
     <p style="margin:0 0 20px;">Open your portal and use <strong>Export CSV</strong> on the Leads tab to keep a copy.</p>
     ${emailButton(c.portalUrl, "Export my leads", PINK)}`
  );
}
