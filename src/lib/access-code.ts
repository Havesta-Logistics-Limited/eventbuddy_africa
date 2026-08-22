import { timingSafeEqual } from "crypto";

/** Server-only (imports Node's `crypto` — never import this from a "use client" file
 *  or anything bundled into the browser). Constant-time comparison for event access
 *  codes, case/whitespace-insensitive to match the UX of the plain `!==` check this
 *  replaces. `timingSafeEqual` throws on mismatched-length buffers, so unequal-length
 *  inputs are treated as a mismatch up front rather than passed through. */
export function accessCodeMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected.trim().toLowerCase());
  const b = Buffer.from(provided.trim().toLowerCase());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
