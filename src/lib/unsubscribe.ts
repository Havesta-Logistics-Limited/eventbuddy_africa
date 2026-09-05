import { createHmac, timingSafeEqual } from "crypto";

/** Signs/verifies an org+email pair for one-click unsubscribe links, without
 *  needing a stored per-recipient token the way organization_followers'
 *  unsubscribe_token does — a blast reaches registrants/leads too, who have no
 *  such column. Keyed on CRON_SECRET: already a private, production-provisioned
 *  secret with no other public exposure, and unrelated in purpose but fine to
 *  reuse for this — swap to a dedicated secret if that ever changes. */
function sign(organizationId: string, email: string): string {
  const secret = process.env.CRON_SECRET || "";
  return createHmac("sha256", secret).update(`${organizationId}:${email.toLowerCase()}`).digest("hex");
}

export function unsubscribeUrl(siteUrl: string, organizationId: string, email: string): string {
  const token = sign(organizationId, email);
  const params = new URLSearchParams({ org: organizationId, email, token });
  return `${siteUrl}/api/unsubscribe?${params.toString()}`;
}

export function verifyUnsubscribeToken(organizationId: string, email: string, token: string): boolean {
  const expected = sign(organizationId, email);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
