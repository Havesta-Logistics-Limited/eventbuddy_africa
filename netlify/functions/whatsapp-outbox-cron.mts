/**
 * Netlify Scheduled Function — every minute, sends the next couple of queued
 * WhatsApp messages through /api/cron/whatsapp-outbox (migration 0146). Slow
 * on purpose: a steady trickle keeps the WhatsApp number from looking like
 * a spammer. Does nothing unless WHATSAPP_ENABLED=true.
 */
export default async () => {
  if (process.env.WHATSAPP_ENABLED !== "true") return;
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
  const secret = process.env.CRON_SECRET;
  if (!siteUrl || !secret) {
    console.error("whatsapp-outbox-cron: missing URL or CRON_SECRET env var, skipping");
    return;
  }
  const res = await fetch(`${siteUrl}/api/cron/whatsapp-outbox`, { headers: { Authorization: `Bearer ${secret}` } });
  const body = await res.text();
  if (!res.ok || !body.includes('"sent":0')) console.log(`whatsapp-outbox-cron: ${res.status} ${body}`);
};

export const config = {
  schedule: "* * * * *",
};
