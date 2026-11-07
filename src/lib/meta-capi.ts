import { createHash } from "node:crypto";

/**
 * Meta Conversions API: reports a confirmed sale to eventbuddy's Meta Pixel
 * from the server, so Meta counts it even when the buyer's browser blocked the
 * Pixel (iPhones, ad blockers) or they closed the tab before coming back from
 * Paystack. The browser sends the same event with the same event_id (the
 * payment reference), and Meta keeps one.
 *
 * Off until NEXT_PUBLIC_META_PIXEL_ID and META_CAPI_ACCESS_TOKEN are set.
 * Never throws and never holds a payment up for more than a few seconds.
 */

/** What the checkout page saw, stored with the pending payment at initialize. */
export type MetaTracking = { fbp?: string; fbc?: string; ip?: string; ua?: string; url?: string };

const hash = (v: string) => createHash("sha256").update(v.trim().toLowerCase()).digest("hex");

export async function sendMetaServerEvent(e: {
  eventName: "Purchase" | "CompleteRegistration";
  eventId: string;
  value?: number;
  currency?: string;
  contentIds?: string[];
  contentName?: string;
  numItems?: number;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  tracking?: MetaTracking | null;
}): Promise<void> {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!pixelId || !token) return;
  const t = e.tracking ?? {};
  const user_data: Record<string, unknown> = {};
  if (e.email) user_data.em = [hash(e.email)];
  // E.164 digits only, as Meta asks (+2348012345678 -> 2348012345678)
  if (e.phone) user_data.ph = [hash(e.phone.replace(/\D/g, ""))];
  if (e.firstName) user_data.fn = [hash(e.firstName)];
  if (e.lastName) user_data.ln = [hash(e.lastName)];
  if (t.ip) user_data.client_ip_address = t.ip;
  if (t.ua) user_data.client_user_agent = t.ua;
  if (t.fbp) user_data.fbp = t.fbp;
  if (t.fbc) user_data.fbc = t.fbc;
  const body = {
    data: [
      {
        event_name: e.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: e.eventId,
        action_source: "website",
        ...(t.url ? { event_source_url: t.url } : {}),
        user_data,
        custom_data: {
          ...(e.value != null ? { value: e.value, currency: e.currency ?? "NGN" } : {}),
          ...(e.contentIds ? { content_ids: e.contentIds, content_type: "product" } : {}),
          ...(e.contentName ? { content_name: e.contentName } : {}),
          ...(e.numItems ? { num_items: e.numItems } : {}),
        },
      },
    ],
    ...(process.env.META_CAPI_TEST_EVENT_CODE ? { test_event_code: process.env.META_CAPI_TEST_EVENT_CODE } : {}),
  };
  const version = process.env.META_GRAPH_VERSION || "v23.0";
  try {
    const res = await fetch(`https://graph.facebook.com/${version}/${pixelId}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) console.error(`[meta-capi] ${e.eventName} ${e.eventId} rejected: ${res.status} ${(await res.text()).slice(0, 300)}`);
  } catch (err) {
    console.error(`[meta-capi] ${e.eventName} ${e.eventId} failed:`, err instanceof Error ? err.message : err);
  }
}

/** The Meta browser cookies and request details worth keeping with a checkout. */
export function metaTrackingFromRequest(request: Request, pageUrl?: string): MetaTracking {
  const cookies = Object.fromEntries(
    (request.headers.get("cookie") ?? "")
      .split(";")
      .map((c) => c.trim().split("="))
      .filter((p) => p.length >= 2)
      .map(([k, ...v]) => [k, decodeURIComponent(v.join("="))])
  );
  const ip = (request.headers.get("x-nf-client-connection-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "").trim();
  return {
    fbp: cookies._fbp,
    fbc: cookies._fbc,
    ip: ip || undefined,
    ua: request.headers.get("user-agent")?.slice(0, 400) || undefined,
    url: pageUrl?.slice(0, 1000),
  };
}
