/**
 * Netlify Scheduled Function — fires once daily and calls the real logic
 * living at /api/cron/rate-limits-cleanup, same pattern as the other
 * scheduled crons in this app. Deletes rate_limits rows older than any
 * window the app actually throttles against.
 */
export default async () => {
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
  const secret = process.env.CRON_SECRET;
  if (!siteUrl || !secret) {
    console.error("rate-limits-cleanup-cron: missing URL or CRON_SECRET env var, skipping");
    return;
  }

  const res = await fetch(`${siteUrl}/api/cron/rate-limits-cleanup`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await res.text();
  console.log(`rate-limits-cleanup-cron: ${res.status} ${body}`);
};

export const config = {
  schedule: "30 3 * * *",
};
