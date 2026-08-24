/**
 * Netlify Scheduled Function — fires every 30 minutes (see the `config.schedule`
 * below) and simply calls the real logic living at /api/cron/draft-reminders (a
 * Next.js Route Handler), rather than duplicating the reminder logic here. Netlify
 * runs scheduled functions on UTC cron syntax and doesn't attach any auth header
 * of its own, unlike Vercel Cron, so this passes CRON_SECRET itself.
 */
export default async () => {
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
  const secret = process.env.CRON_SECRET;
  if (!siteUrl || !secret) {
    console.error("draft-reminders-cron: missing URL or CRON_SECRET env var, skipping");
    return;
  }

  const res = await fetch(`${siteUrl}/api/cron/draft-reminders`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await res.text();
  console.log(`draft-reminders-cron: ${res.status} ${body}`);
};

export const config = {
  schedule: "*/30 * * * *",
};
