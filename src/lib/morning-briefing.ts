import { Resend } from "resend";
import { emailButton, escapeHtml, renderEmailShell } from "@/lib/email-template";
import { formatNaira } from "@/lib/billing";
import { CRON_JOBS } from "@/lib/cron-jobs";

/** What platform_briefing() (migration 0124) returns. */
export type BriefingData = {
  day: string;
  include_test: boolean;
  yesterday: { sales_naira: number; orders: number; revenue_naira: number; attendees: number; checked_in: number; paid_out_naira: number };
  last_week: { sales_naira: number; orders: number; revenue_naira: number; attendees: number };
  new_organizers: { name: string; email: string | null }[];
  new_events: { name: string; organization: string; date: string; published: boolean }[];
  today: { name: string; start_time: string | null; location: string | null; organization: string; attendees: number }[];
  held: { organizers_naira: number; promoters_naira: number };
  inbox: {
    payouts_requested: number; payouts_requested_naira: number; payouts_stuck: number; payouts_failed: number; verifications_pending: number;
    risk_open: number; disputes_open: number; managed_new: number; org_changes: number; promoter_bank_changes: number;
  };
  jobs: Record<string, { started_at: string; ok: boolean; error: string | null }>;
};

/** Where the daily briefing goes (one inbox, not every platform admin). */
export const BRIEFING_TO = "info@eventbuddy.africa";

const PINK = "#C21FAF";
const VIOLET = "#7c3aed";

function change(cur: number, prev: number) {
  if (!prev && !cur) return "";
  if (!prev) return `<span style="color:#059669;">new</span>`;
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return `<span style="color:#94a3b8;">same as last week</span>`;
  return pct > 0 ? `<span style="color:#059669;">▲ ${pct}% vs last week</span>` : `<span style="color:#e11d48;">▼ ${Math.abs(pct)}% vs last week</span>`;
}

const dayLabel = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long" });
const time = (t: string | null) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};

/** The jobs that failed last time, or haven't run when they should have. */
export function jobProblems(jobs: BriefingData["jobs"]) {
  return CRON_JOBS.flatMap((j) => {
    const r = jobs[j.job];
    if (!r) return [];
    if (!r.ok) return [{ label: j.label, why: r.error ? `failed: ${r.error}` : "failed" }];
    const hours = (Date.now() - new Date(r.started_at).getTime()) / 3600_000;
    return hours > j.everyHours + 1 ? [{ label: j.label, why: `hasn't run for ${Math.round(hours)} hours` }] : [];
  });
}

/** Builds the briefing email: subject, plain text and HTML. */
export function renderBriefing(b: BriefingData, siteUrl: string) {
  const y = b.yesterday;
  const i = b.inbox;
  const portal = `${siteUrl}/platform`;
  const actions = [
    { n: i.payouts_requested, t: `${i.payouts_requested === 1 ? "payout request" : "payout requests"} to approve (${formatNaira(i.payouts_requested_naira)})`, tab: "payouts" },
    { n: i.payouts_stuck, t: "payouts processing for over 48 hours", tab: "payouts" },
    { n: i.payouts_failed, t: "failed payouts in the last 30 days", tab: "payouts" },
    { n: i.verifications_pending, t: `${i.verifications_pending === 1 ? "organizer" : "organizers"} waiting for verification`, tab: "payouts" },
    { n: i.risk_open, t: `open risk ${i.risk_open === 1 ? "alert" : "alerts"}`, tab: "risk" },
    { n: i.disputes_open, t: `disputed ${i.disputes_open === 1 ? "payment" : "payments"}`, tab: "billing" },
    { n: i.managed_new, t: `new managed-event ${i.managed_new === 1 ? "request" : "requests"}`, tab: "managed-requests" },
    { n: i.org_changes, t: "organizer account changes to approve", tab: "organizations" },
    { n: i.promoter_bank_changes, t: `promoter bank ${i.promoter_bank_changes === 1 ? "change" : "changes"} to approve`, tab: "payouts" },
  ].filter((a) => a.n > 0);
  const jobsBad = jobProblems(b.jobs);
  const waiting = actions.reduce((a, x) => a + x.n, 0) + jobsBad.length;

  const subject = `eventbuddy briefing: ${formatNaira(y.sales_naira)} sold ${dayLabel(b.day).split(",")[0]}${waiting ? ` · ${waiting} ${waiting === 1 ? "thing needs" : "things need"} you` : " · all clear"}`;

  const stat = (label: string, value: string, delta: string) => `
    <td width="50%" style="padding:6px;">
      <div style="border:1px solid #ece7f3; border-radius:12px; padding:14px 16px;">
        <div style="font-size:12px; color:#6b6080;">${label}</div>
        <div style="font-size:22px; font-weight:700; color:#1e1b2e; margin-top:2px;">${value}</div>
        <div style="font-size:12px; margin-top:2px;">${delta || "&nbsp;"}</div>
      </div>
    </td>`;
  const h = (t: string) => `<p style="margin:26px 0 10px; font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:#8b7fa0;">${t}</p>`;
  const li = (html: string) => `<tr><td style="padding:7px 0; border-top:1px solid #f1edf6; font-size:14px; color:#1e1b2e;">${html}</td></tr>`;
  const list = (rows: string[]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.map(li).join("")}</table>`;

  const html = `
    <p style="margin:0 0 4px; font-size:13px; color:#6b6080;">Good morning. Here's ${escapeHtml(dayLabel(b.day))}${b.include_test ? " (including test payments)" : ""}.</p>

    ${h("Needs your action")}
    ${
      waiting === 0
        ? `<p style="margin:0; padding:12px 14px; border-radius:10px; background:#ecfdf5; color:#047857; font-size:14px;">✓ All clear. Nothing is waiting on you.</p>`
        : list([
            ...actions.map((a) => `<a href="${portal}?tab=${a.tab}" style="color:#1e1b2e; text-decoration:none;"><strong style="color:${PINK};">${a.n}</strong> ${escapeHtml(a.t)} →</a>`),
            ...jobsBad.map((j) => `<a href="${portal}?tab=jobs" style="color:#1e1b2e; text-decoration:none;"><strong style="color:#e11d48;">!</strong> ${escapeHtml(j.label)} ${escapeHtml(j.why)} →</a>`),
          ])
    }

    ${h("Yesterday")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -6px;">
      <tr>${stat("Ticket and stand sales", formatNaira(y.sales_naira), change(y.sales_naira, b.last_week.sales_naira))}${stat("eventbuddy revenue", formatNaira(y.revenue_naira), change(y.revenue_naira, b.last_week.revenue_naira))}</tr>
      <tr>${stat("Paid orders", String(y.orders), change(y.orders, b.last_week.orders))}${stat("Attendees registered", String(y.attendees), change(y.attendees, b.last_week.attendees))}</tr>
    </table>
    <p style="margin:10px 0 0; font-size:13px; color:#6b6080;">
      ${y.checked_in} checked in at events · ${formatNaira(y.paid_out_naira)} paid out ·
      holding ${formatNaira(Math.round(b.held.organizers_naira) + Math.round(b.held.promoters_naira))} (${formatNaira(Math.round(b.held.organizers_naira))} organizers, ${formatNaira(Math.round(b.held.promoters_naira))} promoters)
    </p>

    ${
      b.new_organizers.length
        ? h(`New organizers (${b.new_organizers.length})`) +
          list(b.new_organizers.slice(0, 8).map((o) => `${escapeHtml(o.name)}${o.email ? ` <span style="color:#8b7fa0;">· ${escapeHtml(o.email)}</span>` : ""}`)) +
          (b.new_organizers.length > 8 ? `<p style="margin:6px 0 0; font-size:12px; color:#8b7fa0;">and ${b.new_organizers.length - 8} more</p>` : "")
        : ""
    }
    ${
      b.new_events.length
        ? h(`New events (${b.new_events.length})`) +
          list(b.new_events.slice(0, 8).map((e) => `${escapeHtml(e.name)} <span style="color:#8b7fa0;">· ${escapeHtml(e.organization)}${e.published ? "" : " · draft"}</span>`)) +
          (b.new_events.length > 8 ? `<p style="margin:6px 0 0; font-size:12px; color:#8b7fa0;">and ${b.new_events.length - 8} more</p>` : "")
        : ""
    }

    ${h(`Happening today (${b.today.length})`)}
    ${
      b.today.length
        ? list(b.today.map((e) => `${time(e.start_time) ? `<strong>${time(e.start_time)}</strong> · ` : ""}${escapeHtml(e.name)} <span style="color:#8b7fa0;">· ${escapeHtml(e.organization)}${e.location ? ` · ${escapeHtml(e.location)}` : ""} · ${e.attendees} attendees</span>`))
        : `<p style="margin:0; font-size:14px; color:#6b6080;">No events today.</p>`
    }

    <div style="margin-top:28px;">${emailButton(portal, "Open the platform portal", VIOLET)}</div>
    <p style="margin:18px 0 0; font-size:12px; color:#94a3b8;">Sent to ${BRIEFING_TO} every day at 7am. Turn it off on the portal's Job health tab.</p>`;

  const text = [
    `eventbuddy briefing for ${dayLabel(b.day)}`,
    "",
    waiting ? "Needs your action:" : "All clear: nothing is waiting on you.",
    ...actions.map((a) => `- ${a.n} ${a.t}`),
    ...jobsBad.map((j) => `- ${j.label} ${j.why}`),
    "",
    `Yesterday: ${formatNaira(y.sales_naira)} sold, ${formatNaira(y.revenue_naira)} revenue, ${y.orders} orders, ${y.attendees} attendees, ${y.checked_in} checked in, ${formatNaira(y.paid_out_naira)} paid out.`,
    b.new_organizers.length ? `New organizers: ${b.new_organizers.map((o) => o.name).join(", ")}` : "",
    b.new_events.length ? `New events: ${b.new_events.map((e) => `${e.name} (${e.organization})`).join(", ")}` : "",
    b.today.length ? `Today: ${b.today.map((e) => `${e.name} (${e.organization})`).join(", ")}` : "No events today.",
    "",
    `Open the portal: ${portal}`,
  ]
    .filter((l, idx, arr) => l !== "" || arr[idx - 1] !== "")
    .join("\n");

  return { subject, text, html: renderEmailShell({ color: VIOLET, label: "Morning briefing", emoji: "☀️" }, html) };
}

/** Sends the briefing to BRIEFING_TO (or `to`, for a test). */
export async function sendBriefing(email: { subject: string; text: string; html: string }, to?: string[]) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return { sent: 0, error: "Email isn't configured (RESEND_API_KEY)." };
  const recipients = to ?? [BRIEFING_TO];
  const resend = new Resend(apiKey);
  let sent = 0;
  for (const addr of recipients) {
    const { error } = await resend.emails.send({ from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>", to: addr, subject: email.subject, text: email.text, html: email.html });
    if (!error) sent++;
  }
  return { sent, error: sent < recipients.length ? `${recipients.length - sent} of ${recipients.length} emails failed` : null };
}
