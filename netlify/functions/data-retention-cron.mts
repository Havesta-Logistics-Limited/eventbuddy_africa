/**
 * Netlify Scheduled Function — fires nightly and calls the real logic at
 * /api/cron/data-retention (migration 0115): reminds exhibitors before their
 * leads expire, then removes personal data past its retention period.
 */
export default async () => {
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
  const secret = process.env.CRON_SECRET;
  if (!siteUrl || !secret) {
    console.error("data-retention-cron: missing URL or CRON_SECRET env var, skipping");
    return;
  }

  const res = await fetch(`${siteUrl}/api/cron/data-retention`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await res.text();
  console.log(`data-retention-cron: ${res.status} ${body}`);
};

export const config = {
  schedule: "15 2 * * *",
};
