/**
 * Netlify Scheduled Function — fires at 06:00 UTC (7am in Lagos) and calls
 * the real logic at /api/cron/morning-briefing (migration 0124): the daily
 * email to platform admins with yesterday's numbers and what needs them.
 */
export default async () => {
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
  const secret = process.env.CRON_SECRET;
  if (!siteUrl || !secret) {
    console.error("morning-briefing-cron: missing URL or CRON_SECRET env var, skipping");
    return;
  }

  const res = await fetch(`${siteUrl}/api/cron/morning-briefing`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await res.text();
  console.log(`morning-briefing-cron: ${res.status} ${body}`);
};

export const config = {
  schedule: "0 6 * * *",
};
