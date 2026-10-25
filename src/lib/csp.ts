/**
 * The site's Content-Security-Policy, built per request in the proxy with a
 * fresh nonce. Next.js reads the nonce from the request's CSP header and puts
 * it on its own scripts; 'strict-dynamic' then trusts the scripts those load
 * (Google Analytics, the kiosk's Paystack popup, Turnstile). Anything injected
 * into a page (an <img onerror>, a <script> in an event description) carries
 * no nonce, so the browser refuses to run it.
 *
 * Styles stay 'unsafe-inline': React's style={{}} props and Paystack's popup
 * set inline styles, and a style can't run code. Images may come from any
 * https host: organizers paste external cover URLs.
 */
export function buildCsp(nonce: string): string {
  const dev = process.env.NODE_ENV === "development";
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;
  const supabaseHosts = supabase ? [supabase.origin, `wss://${supabase.host}`] : [];
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'unsafe-inline' and https: only apply to old browsers that ignore nonces
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "'wasm-unsafe-eval'", "https:", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      ...supabaseHosts,
      "https://*.google-analytics.com",
      "https://*.analytics.google.com",
      "https://*.googletagmanager.com",
      "https://challenges.cloudflare.com",
      "https://*.paystack.co",
      "https://*.paystack.com",
      ...(dev ? ["ws:"] : []),
    ],
    "frame-src": ["https://challenges.cloudflare.com", "https://*.paystack.co", "https://*.paystack.com"],
    "media-src": ["'self'", "blob:", "data:"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'", "https://*.paystack.com"],
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ")
    .concat(dev ? "" : "; upgrade-insecure-requests");
}

export function newNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}
