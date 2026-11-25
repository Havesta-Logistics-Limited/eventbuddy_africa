import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "@/lib/validation";
import { formatTime } from "@/lib/utils";

/**
 * WhatsApp messaging (migration 0146), pilot on a self-hosted WAHA server
 * (https://waha.devlike.pro): a spare WhatsApp number linked by QR code, the
 * same way WhatsApp Web is. Unofficial, so the number can be banned if it
 * looks like spam. Everything here is built around that:
 *
 *   * Messages eventbuddy starts itself (flyers, tickets, reminders) never go
 *     out directly. They wait in whatsapp_outbox and the outbox cron sends a
 *     couple a minute, with a typing pause, under a daily cap.
 *   * Every one of them says how to stop (reply STOP), and opted-out numbers
 *     are skipped.
 *   * Replies to people who message us first go straight away: that's normal
 *     use and the lowest risk.
 *   * Nothing is ever sent unless WHATSAPP_ENABLED=true and the WAHA server is
 *     set, and, while WHATSAPP_ORGS is set, only for those organizers.
 *
 * Moving to Meta's official API later means replacing sendText/sendImage
 * below; the queue, messages and callers stay the same.
 *
 * Env: WHATSAPP_ENABLED, WAHA_URL, WAHA_API_KEY, WAHA_SESSION (default
 * "default"), WAHA_WEBHOOK_HMAC_KEY (inbound), WHATSAPP_ORGS (optional,
 * comma-separated org slugs or ids), WHATSAPP_PER_RUN (default 2, max 4),
 * WHATSAPP_DAILY_CAP (default 200).
 */

export const STOP_LINE = "Reply STOP to stop WhatsApp messages from eventbuddy.";

type Config = { url: string; apiKey: string; session: string };

export function whatsappConfig(): Config | null {
  if (process.env.WHATSAPP_ENABLED !== "true") return null;
  const url = process.env.WAHA_URL?.replace(/\/+$/, "");
  if (!url) return null;
  return { url, apiKey: process.env.WAHA_API_KEY ?? "", session: process.env.WAHA_SESSION || "default" };
}

/** Whether eventbuddy may message on this organizer's behalf. With WHATSAPP_ORGS
 *  set (the pilot), only the organizers listed there, by slug or id. */
export function whatsappAllowedFor(org: { id?: string | null; slug?: string | null }): boolean {
  if (!whatsappConfig()) return false;
  const list = (process.env.WHATSAPP_ORGS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return true;
  return Boolean((org.id && list.includes(org.id)) || (org.slug && list.includes(org.slug)));
}

export function perRunLimit(): number {
  const n = parseInt(process.env.WHATSAPP_PER_RUN ?? "2", 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 4) : 2;
}

export function dailyCap(): number {
  const n = parseInt(process.env.WHATSAPP_DAILY_CAP ?? "200", 10);
  return Number.isFinite(n) && n > 0 ? n : 200;
}

// ---- phone numbers ----------------------------------------------------------

/** "+2348012345678" → "2348012345678@c.us"; null for anything that isn't a valid number. */
export function chatIdFor(phone: string): string | null {
  const p = normalizePhone(phone);
  return p ? `${p.slice(1)}@c.us` : null;
}

/** "2348012345678@c.us" → "+2348012345678". Group, broadcast and @lid ids give null. */
export function phoneFromChatId(chatId: string): string | null {
  const m = /^(\d{10,15})@(c\.us|s\.whatsapp\.net)$/.exec(chatId);
  return m ? normalizePhone(`+${m[1]}`) : null;
}

/** The ways one number may have been stored before phones were normalized
 *  (2026-10-06): +2348012345678, 2348012345678, 08012345678. */
export function phoneVariants(phone: string): string[] {
  const p = normalizePhone(phone);
  if (!p) return [];
  const out = new Set([p, p.slice(1)]);
  if (p.startsWith("+234")) out.add(`0${p.slice(4)}`);
  return Array.from(out);
}

// ---- WAHA -------------------------------------------------------------------

export class WhatsAppError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

async function waha<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const cfg = whatsappConfig();
  if (!cfg) throw new WhatsAppError("WhatsApp isn't set up");
  const res = await fetch(`${cfg.url}${path}`, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", ...(cfg.apiKey ? { "X-Api-Key": cfg.apiKey } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new WhatsAppError(`WAHA ${res.status}: ${text.slice(0, 300)}`, res.status);
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    return {} as T;
  }
}

function session() {
  return whatsappConfig()?.session ?? "default";
}

export async function sendText(chatId: string, text: string) {
  await waha("/api/sendText", { body: { session: session(), chatId, text, linkPreview: false } });
}

export async function sendImage(chatId: string, image: { data: Buffer; mimetype: string; filename: string }, caption: string) {
  await waha("/api/sendImage", {
    body: { session: session(), chatId, caption, file: { mimetype: image.mimetype, filename: image.filename, data: image.data.toString("base64") } },
  });
}

/** Shows "typing…" for a moment before a message, the way a person would. Best-effort. */
export async function typingPause(chatId: string, ms: number) {
  try {
    await waha("/api/startTyping", { body: { session: session(), chatId } });
    await new Promise((r) => setTimeout(r, ms));
    await waha("/api/stopTyping", { body: { session: session(), chatId } });
  } catch {
    /* only cosmetic */
  }
}

export async function markSeen(chatId: string) {
  try {
    await waha("/api/sendSeen", { body: { session: session(), chatId } });
  } catch {
    /* only cosmetic */
  }
}

/** The sender's phone number. Newer WhatsApp accounts arrive as an @lid id
 *  instead of a number; WAHA maps those back when it knows the number. */
export async function senderPhone(from: string): Promise<string | null> {
  const direct = phoneFromChatId(from);
  if (direct) return direct;
  if (!from.endsWith("@lid")) return null;
  try {
    const res = await waha<{ pn?: string | null }>(`/api/${encodeURIComponent(session())}/lids/${encodeURIComponent(from)}`);
    return res.pn ? phoneFromChatId(res.pn) : null;
  } catch {
    return null;
  }
}

/** The linked number's state: WORKING when it can send. */
export async function sessionStatus(): Promise<{ status: string; me?: string } | null> {
  if (!whatsappConfig()) return null;
  try {
    const res = await waha<{ status?: string; me?: { id?: string } | null }>(`/api/sessions/${encodeURIComponent(session())}`);
    return { status: res.status ?? "UNKNOWN", me: res.me?.id ? phoneFromChatId(res.me.id) ?? undefined : undefined };
  } catch (err) {
    return { status: err instanceof WhatsAppError && err.status ? `ERROR ${err.status}` : "UNREACHABLE" };
  }
}

// ---- messages ---------------------------------------------------------------

export type MessageEvent = { name: string; date: string; start_time: string | null; end_time?: string | null; venue: string; location: string };

export function eventWhen(event: MessageEvent): string {
  const date = new Date(`${event.date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const time = event.start_time ? `${formatTime(event.start_time)}${event.end_time ? ` – ${formatTime(event.end_time)}` : ""}` : "";
  return time ? `${date} · ${time}` : date;
}

export function eventWhere(event: MessageEvent): string {
  return [event.venue, event.location].map((s) => s?.trim()).filter(Boolean).join(", ");
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full.trim();
}

export function inviteMessage(guestName: string, event: MessageEvent, orgName: string) {
  return [
    `Hello ${firstName(guestName)}, you're invited to *${event.name}*${orgName ? ` by ${orgName}` : ""}.`,
    "",
    eventWhen(event),
    eventWhere(event),
    "",
    "This is your personal invitation. Please keep it and show the QR code at the entrance.",
    "",
    STOP_LINE,
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
}

export function ticketMessage(fullName: string, event: MessageEvent, referenceId: string, hubUrl?: string) {
  return [
    `Hi ${firstName(fullName)}, you're registered for *${event.name}*.`,
    "",
    eventWhen(event),
    eventWhere(event),
    `Ticket: *${referenceId}*`,
    "",
    "Show this QR code at check-in.",
    hubUrl ? `Event hub (schedule, speakers, Q&A): ${hubUrl}` : "",
    "",
    "Lost it? Message this chat any time and we'll send it again.",
    STOP_LINE,
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
}

export function reminderMessage(fullName: string, event: MessageEvent, referenceId: string) {
  return [
    `Hi ${firstName(fullName)}, *${event.name}* is today.`,
    "",
    eventWhen(event),
    eventWhere(event),
    `Your ticket: *${referenceId}*`,
    "",
    "Your QR code is below. See you there!",
    "",
    STOP_LINE,
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
}

// ---- queue ------------------------------------------------------------------

export type OutboxInsert = {
  kind: "invite" | "ticket" | "reminder";
  dedupe_key: string;
  to_phone: string;
  body: string;
  image_kind?: "invite_flyer" | "ticket_qr" | null;
  fallback_text?: string | null;
  organization_id?: string | null;
  event_id?: string | null;
  registration_id?: string | null;
  guest_id?: string | null;
  priority?: number;
  expires_at?: string | null;
};

/** Adds messages to the outbox. A dedupe_key already there is left alone, so
 *  calling this twice for the same ticket or guest never sends twice. Returns
 *  how many were newly queued. */
export async function queueWhatsApp(admin: SupabaseClient, rows: OutboxInsert[]): Promise<number> {
  const clean = rows
    .map((r) => ({ ...r, to_phone: normalizePhone(r.to_phone) ?? "" }))
    .filter((r) => r.to_phone);
  if (clean.length === 0) return 0;
  let queued = 0;
  for (let i = 0; i < clean.length; i += 500) {
    const { data, error } = await admin
      .from("whatsapp_outbox")
      .upsert(clean.slice(i, i + 500), { onConflict: "dedupe_key", ignoreDuplicates: true })
      .select("id");
    if (error) {
      console.error("[whatsapp] couldn't queue:", error.message);
      continue;
    }
    queued += data?.length ?? 0;
  }
  return queued;
}

/** A confirmed ticket's QR by WhatsApp, next to the confirmation email.
 *  Best-effort and silent: no phone, not enabled, or a queue error never
 *  touches the registration itself. In-person events only. */
export async function queueTicketWhatsApp(
  admin: SupabaseClient,
  t: {
    registrationId: string;
    organizationId: string;
    orgSlug?: string | null;
    eventId: string;
    phone: string | null | undefined;
    fullName: string;
    referenceId: string;
    event: MessageEvent & { event_format?: string | null };
    hubUrl?: string;
  },
) {
  try {
    if (!t.phone || t.event.event_format === "virtual") return;
    if (!whatsappAllowedFor({ id: t.organizationId, slug: t.orgSlug })) return;
    await queueWhatsApp(admin, [
      {
        kind: "ticket",
        dedupe_key: `ticket:${t.registrationId}`,
        to_phone: t.phone,
        body: ticketMessage(t.fullName, t.event, t.referenceId, t.hubUrl),
        image_kind: "ticket_qr",
        organization_id: t.organizationId,
        event_id: t.eventId,
        registration_id: t.registrationId,
        priority: 1,
      },
    ]);
  } catch (err) {
    console.error("[whatsapp] ticket not queued:", err instanceof Error ? err.message : err);
  }
}

/** Records a reply already sent straight away (it skipped the queue). */
export async function logReply(admin: SupabaseClient, phone: string, body: string, eventId?: string | null) {
  const to = normalizePhone(phone);
  if (!to) return;
  await admin
    .from("whatsapp_outbox")
    .insert({ kind: "reply", to_phone: to, body: body.slice(0, 4000), status: "sent", sent_at: new Date().toISOString(), event_id: eventId ?? null, priority: 0 })
    .then(({ error }) => error && console.error("[whatsapp] reply not logged:", error.message));
}

export async function isOptedOut(admin: SupabaseClient, phone: string): Promise<boolean> {
  const { data } = await admin.from("whatsapp_optouts").select("phone").eq("phone", phone).maybeSingle();
  return Boolean(data);
}
