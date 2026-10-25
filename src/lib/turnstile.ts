import "server-only";

/**
 * Cloudflare Turnstile ("prove you're human") for the public forms:
 * registration, paid checkout and contact. Off until TURNSTILE_SECRET_KEY is
 * set, so local dev and a deploy without keys keep working.
 *
 * The mobile app can't show the widget yet, so a request marked
 * source: "mobile" is let through without a token (callers rate-limit those
 * more tightly). That marker can be faked; the app needs its own check.
 */
export function turnstileEnabled(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY;
}

export async function verifyTurnstile(token: unknown, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    // Cloudflare unreachable: fail closed, the visitor can retry
    return false;
  }
}

export const TURNSTILE_FAILED_MESSAGE = "Please complete the \"I'm human\" check and try again.";
