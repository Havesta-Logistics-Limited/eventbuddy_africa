/**
 * Netlify Scheduled Function — fires once daily and calls the real logic living
 * at /api/cron/rsvp-reminders (a Next.js Route Handler), same pattern as
 * draft-reminders-cron.mts. Daily rather than every 30 minutes since this is a
 * one-time-per-guest nudge, not a repeating draft reminder — the route itself
 * tracks reminder_sent_at so a slow/duplicate run can never double-send.
 */
export default async () => {
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
  const secret = process.env.CRON_SECRET;
  if (!siteUrl || !secret) {
    console.error("rsvp-reminders-cron: missing URL or CRON_SECRET env var, skipping");
    return;
  }

  const res = await fetch(`${siteUrl}/api/cron/rsvp-reminders`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await res.text();
  console.log(`rsvp-reminders-cron: ${res.status} ${body}`);
};

export const config = {
  schedule: "0 9 * * *",
};
