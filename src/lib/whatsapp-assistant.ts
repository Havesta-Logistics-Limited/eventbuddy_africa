import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { brandedQrBuffer } from "@/lib/branded-qr-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { looksLikeHtml, stripHtml } from "@/lib/rich-text";
import { eventWhen, eventWhere, logReply, markSeen, phoneVariants, sendImage, sendText, typingPause, whatsappAllowedFor } from "@/lib/whatsapp";

/**
 * The eventbuddy WhatsApp assistant (migration 0146). Someone messages the
 * eventbuddy number; we find their tickets by the number they message from
 * (WhatsApp has already verified it) and:
 *
 *   * "ticket", "QR", "lost my code"…  → their ticket QR for each upcoming event
 *   * a ticket reference (ABCD-1234)    → that ticket's QR
 *   * STOP / START                      → opt out of / back into our messages
 *   * any other question                → Claude answers from the event's own
 *                                         details, and says so when it doesn't know
 *
 * Only replies: the person wrote first, which is ordinary WhatsApp use and
 * the lowest ban risk. Rate-limited per number. Message text isn't stored.
 */

export const ASSISTANT_MODEL = "claude-opus-5-5";

const STOP_RE = /^\s*(stop|unsubscribe|stop all|stopall|opt out|optout)\s*[.!]?\s*$/i;
const START_RE = /^\s*(start|unstop|subscribe)\s*[.!]?\s*$/i;
const TICKET_RE = /\b(tickets?|qr|code|barcode|lost|resend|send (it )?again|pass|entry|reference|ref)\b/i;
const GREETING_RE = /^\s*(hi+|hello|hey|hiya|good (morning|afternoon|evening)|help|menu|start over)\W*$/i;
const REFERENCE_RE = /\b([A-Z0-9]{4})-?([A-Z0-9]{4})\b/;

type TicketEvent = {
  id: string;
  name: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  venue: string;
  location: string;
  event_format: string | null;
  description: string | null;
  published: boolean;
  organizations: { name: string; slug: string; is_suspended: boolean } | null;
};
type Ticket = { id: string; reference_id: string; full_name: string; status: string; organization_id: string; events: TicketEvent };

const TICKET_SELECT =
  "id, reference_id, full_name, status, organization_id, events!inner(id, name, date, start_time, end_time, venue, location, event_format, description, published, organizations(name, slug, is_suspended))";

function usable(tickets: Ticket[]): Ticket[] {
  return tickets.filter((t) => t.events && !t.events.organizations?.is_suspended && whatsappAllowedFor({ id: t.organization_id, slug: t.events.organizations?.slug }));
}

/** Upcoming (from yesterday on) confirmed tickets registered with this number, soonest first. */
async function ticketsForPhone(admin: SupabaseClient, phone: string): Promise<Ticket[]> {
  const variants = phoneVariants(phone);
  if (variants.length === 0) return [];
  const since = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  const { data } = await admin
    .from("registrations")
    .select(TICKET_SELECT)
    .in("phone", variants)
    .in("status", ["registered", "checked_in"])
    .gte("events.date", since)
    .limit(20);
  return usable((data ?? []) as unknown as Ticket[]).sort((a, b) => a.events.date.localeCompare(b.events.date));
}

async function ticketByReference(admin: SupabaseClient, reference: string): Promise<Ticket | null> {
  const { data } = await admin.from("registrations").select(TICKET_SELECT).eq("reference_id", reference).in("status", ["registered", "checked_in"]).maybeSingle();
  return data ? usable([data as unknown as Ticket])[0] ?? null : null;
}

function plain(text: string | null | undefined, max: number): string {
  const t = (text ?? "").trim();
  return (looksLikeHtml(t) ? stripHtml(t) : t).replace(/\s+\n/g, "\n").slice(0, max);
}

function eventList(tickets: Ticket[]): string {
  return tickets.map((t) => `• *${t.events.name}*, ${eventWhen(t.events)}`).join("\n");
}

const HELP_NO_TICKET = [
  "Hi, this is eventbuddy.",
  "",
  "I couldn't find a ticket for this WhatsApp number. If you registered with a different number, send me your ticket reference (it looks like ABCD-1234) and I'll send your QR code.",
].join("\n");

/** Claude answers a question from the attendee's events' own details only. */
async function answerQuestion(question: string, tickets: Ticket[]): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const facts = tickets
    .slice(0, 3)
    .map((t) => {
      const e = t.events;
      return [
        `Event: ${e.name}`,
        `Organizer: ${e.organizations?.name ?? ""}`,
        `When: ${eventWhen(e)}`,
        `Where: ${e.event_format === "virtual" ? "Online" : eventWhere(e)}`,
        `Attendee's ticket reference: ${t.reference_id}${t.status === "checked_in" ? " (already checked in)" : ""}`,
        `About the event (from the organizer):\n${plain(e.description, 3000) || "(no description)"}`,
      ].join("\n");
    })
    .join("\n\n---\n\n");

  const client = new Anthropic({ apiKey, timeout: 25_000, maxRetries: 1 });
  try {
    const res = await client.beta.messages.create({
      model: ASSISTANT_MODEL,
      max_tokens: 2000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [
        "You are eventbuddy's WhatsApp assistant, replying to an attendee about events they have tickets for.",
        "Answer only from the event details provided. If the answer isn't there (parking, dress code, refunds, anything else), say you don't have that information and suggest they contact the organizer. Never invent details.",
        "If they want their ticket or QR code, tell them to reply TICKET.",
        "Write like a friendly person on WhatsApp: plain text, no markdown headings or tables, at most about 80 words. *bold* is fine for an event name.",
        "",
        "Event details:",
        facts,
      ].join("\n"),
      messages: [{ role: "user", content: question.slice(0, 1000) }],
    });
    if (res.stop_reason === "refusal") return null;
    const text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return text || null;
  } catch (err) {
    console.error("[whatsapp-assistant] Claude call failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function handleInboundWhatsApp(admin: SupabaseClient, msg: { chatId: string; phone: string | null; text: string }) {
  const { chatId, phone } = msg;
  const text = msg.text.trim();
  if (!text) return;
  // a looping bot or someone hammering the number gets ignored, not answered
  if (!(await checkRateLimit(`wa-in:${phone ?? chatId}`, 20, 60 * 60))) return;

  await markSeen(chatId);

  const reply = async (body: string, eventId?: string) => {
    await typingPause(chatId, 800 + Math.min(body.length * 8, 2500));
    await sendText(chatId, body);
    if (phone) await logReply(admin, phone, body, eventId);
  };
  const sendTicket = async (t: Ticket) => {
    const qr = await brandedQrBuffer(t.reference_id, { width: 640, margin: 2 });
    const caption = [`*${t.events.name}*`, eventWhen(t.events), eventWhere(t.events), `Ticket: *${t.reference_id}* (${t.full_name})`, "", "Show this QR code at check-in."].filter(Boolean).join("\n");
    await typingPause(chatId, 1200);
    try {
      await sendImage(chatId, { data: qr, mimetype: "image/png", filename: `${t.reference_id}.png` }, caption);
    } catch {
      await sendText(chatId, `${caption}\n\n(Your QR code couldn't be attached. Show your ticket reference at the door instead.)`);
    }
    if (phone) await logReply(admin, phone, caption, t.events.id);
  };

  if (STOP_RE.test(text)) {
    if (phone) await admin.from("whatsapp_optouts").upsert({ phone }, { onConflict: "phone", ignoreDuplicates: true });
    await reply("Done. You won't get any more WhatsApp messages from eventbuddy. Reply START if you change your mind.");
    return;
  }
  if (START_RE.test(text)) {
    if (phone) await admin.from("whatsapp_optouts").delete().eq("phone", phone);
    await reply("You're back on. You'll get your tickets and event-day reminders here again.");
    return;
  }

  const refMatch = REFERENCE_RE.exec(text.toUpperCase());
  if (refMatch) {
    const t = await ticketByReference(admin, `${refMatch[1]}-${refMatch[2]}`);
    if (t) {
      await sendTicket(t);
      return;
    }
  }

  const tickets = phone ? await ticketsForPhone(admin, phone) : [];

  if (TICKET_RE.test(text) || refMatch) {
    if (tickets.length === 0) {
      await reply(refMatch ? "I couldn't find a ticket with that reference. Please check it and send it again." : HELP_NO_TICKET);
      return;
    }
    for (const t of tickets.slice(0, 3)) await sendTicket(t);
    if (tickets.length > 3) await reply(`You have ${tickets.length} upcoming tickets. I've sent the next 3. Send a ticket reference for any other one.`);
    return;
  }

  if (tickets.length === 0) {
    await reply(HELP_NO_TICKET);
    return;
  }

  if (GREETING_RE.test(text)) {
    await reply([`Hi ${tickets[0].full_name.split(/\s+/)[0]}, this is eventbuddy. Your upcoming events:`, eventList(tickets.slice(0, 5)), "", "Reply TICKET for your QR code, or ask me anything about the event."].join("\n"), tickets[0].events.id);
    return;
  }

  const answer = await answerQuestion(text, tickets);
  await reply(
    answer ?? [`Your upcoming events:`, eventList(tickets.slice(0, 5)), "", "Reply TICKET for your QR code. For other questions, please contact the organizer."].join("\n"),
    tickets[0].events.id,
  );
}
