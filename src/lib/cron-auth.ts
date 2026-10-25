import { createHash, timingSafeEqual } from "node:crypto";

/** Whether a scheduled-job request carries `Authorization: Bearer <CRON_SECRET>`.
 *  Compared in constant time (hashed first so lengths always match). */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = createHash("sha256").update(request.headers.get("authorization") ?? "").digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(given, expected);
}
