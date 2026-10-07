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

export function emailPaid(to: string | string[], c: Ctx & { standLabel?: string | null }) {
  return send(
    to,
    `Stand confirmed: ${c.company} at ${c.eventName}`,
    `${c.company}'s ${c.standName} at ${c.eventName} is paid and confirmed (${formatNaira(c.price ?? 0)}).`,
    { label: "Stand confirmed", emoji: "✅" },
    `<p style="margin:0 0 14px;"><strong>${escapeHtml(c.company)}</strong>'s stand at <strong>${escapeHtml(c.eventName)}</strong> is paid and confirmed.</p>
     <p style="margin:0 0 6px;">Stand: ${escapeHtml(c.standName)}${c.standLabel ? ` (${escapeHtml(c.standLabel)})` : ""}</p>
     <p style="margin:0;">Paid: ${escapeHtml(formatNaira(c.price ?? 0))}</p>`
  );
}
