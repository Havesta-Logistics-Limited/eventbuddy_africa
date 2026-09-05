/**
 * Netlify Scheduled Function — fires hourly and calls the real logic living at
 * /api/cron/event-reminders (a Next.js Route Handler), same pattern as
 * rsvp-reminders-cron.mts. Hourly rather than daily since one of the three
 * reminder stages (1 hour before) needs finer granularity than a daily cron
 * could ever catch — the route itself tracks 3 independent *_sent_at columns
 * so a slow/duplicate run can never double-send any one stage.
 */
export default async () => {
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
  const secret = process.env.CRON_SECRET;
  if (!siteUrl || !secret) {
    console.error("event-reminders-cron: missing URL or CRON_SECRET env var, skipping");
    return;
  }

  const res = await fetch(`${siteUrl}/api/cron/event-reminders`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await res.text();
  console.log(`event-reminders-cron: ${res.status} ${body}`);
};

export const config = {
  schedule: "0 * * * *",
};
