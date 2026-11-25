import { NextResponse, after } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { senderPhone, whatsappConfig } from "@/lib/whatsapp";
import { handleInboundWhatsApp } from "@/lib/whatsapp-assistant";

export const maxDuration = 26;

/** HMAC-SHA512 of the raw body with WAHA_WEBHOOK_HMAC_KEY (WAHA's X-Webhook-Hmac). */
function signatureOk(raw: string, given: string | null): boolean {
  const key = process.env.WAHA_WEBHOOK_HMAC_KEY;
  if (!key || !given) return false;
  const expected = Buffer.from(createHmac("sha512", key).update(raw).digest("hex"));
  const got = Buffer.from(given.trim().toLowerCase());
  return expected.length === got.length && timingSafeEqual(expected, got);
}

type WahaMessage = {
  event?: string;
  payload?: { id?: string; from?: string; fromMe?: boolean; body?: string | null };
};

/**
 * WAHA calls this for every message the eventbuddy WhatsApp number receives
 * (set WHATSAPP_HOOK_URL to this route, WHATSAPP_HOOK_EVENTS=message and
 * WHATSAPP_HOOK_HMAC_KEY to the same secret as WAHA_WEBHOOK_HMAC_KEY). Answers
 * 200 at once and replies in the background, so WAHA doesn't retry while the
 * assistant is thinking. Groups, status updates and our own messages are ignored.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!signatureOk(raw, request.headers.get("x-webhook-hmac"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!whatsappConfig()) return NextResponse.json({ ok: true, ignored: "off" });

  let body: WahaMessage;
  try {
    body = JSON.parse(raw) as WahaMessage;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const p = body.payload;
  if (body.event !== "message" || !p?.from || p.fromMe || typeof p.body !== "string" || !p.body.trim()) {
    return NextResponse.json({ ok: true, ignored: true });
  }
  const from = p.from;
  if (!/@(c\.us|s\.whatsapp\.net|lid)$/.test(from)) return NextResponse.json({ ok: true, ignored: true });
  // WAHA retries on slow answers: each message is handled once
  if (p.id && !(await checkRateLimit(`wa-msg:${p.id}`, 1, 24 * 60 * 60))) return NextResponse.json({ ok: true, duplicate: true });

  const text = p.body.slice(0, 2000);
  after(async () => {
    try {
      const phone = await senderPhone(from);
      await handleInboundWhatsApp(createAdminClient(), { chatId: from, phone, text });
    } catch (err) {
      console.error("[whatsapp-webhook] reply failed:", err instanceof Error ? err.message : err);
    }
  });
  return NextResponse.json({ ok: true });
}
