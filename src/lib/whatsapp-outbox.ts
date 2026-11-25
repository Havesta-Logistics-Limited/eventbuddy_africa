import type { SupabaseClient } from "@supabase/supabase-js";
import { brandedQrBuffer } from "@/lib/branded-qr-server";
import { lookupInvite } from "@/lib/invite-lookup";
import { renderInviteFlyer } from "@/lib/invite-flyer";
import { chatIdFor, dailyCap, isOptedOut, perRunLimit, sendImage, sendText, sessionStatus, typingPause, whatsappConfig } from "@/lib/whatsapp";

type OutboxRow = {
  id: string;
  kind: "invite" | "ticket" | "reminder" | "reply";
  to_phone: string;
  body: string;
  image_kind: "invite_flyer" | "ticket_qr" | null;
  fallback_text: string | null;
  registration_id: string | null;
  guest_id: string | null;
  attempts: number;
};

type Image = { data: Buffer; mimetype: string; filename: string };

/** null = send without a picture; "skip" = the message no longer applies (ticket cancelled, guest removed). */
async function buildImage(admin: SupabaseClient, row: OutboxRow): Promise<Image | null | "skip"> {
  if (row.image_kind === "invite_flyer") {
    if (!row.guest_id) return "skip";
    const { data: guest } = await admin.from("event_guests").select("invite_token").eq("id", row.guest_id).maybeSingle();
    if (!guest?.invite_token) return "skip";
    const invite = await lookupInvite(admin, guest.invite_token);
    if (!invite?.referenceId || !invite.design) return "skip";
    const image = await renderInviteFlyer(invite.design, invite.guestName, invite.referenceId);
    return { data: Buffer.from(await image.arrayBuffer()), mimetype: "image/png", filename: "invitation.png" };
  }
  if (row.image_kind === "ticket_qr") {
    if (!row.registration_id) return "skip";
    const { data: reg } = await admin.from("registrations").select("reference_id, status").eq("id", row.registration_id).maybeSingle();
    if (!reg || !["registered", "checked_in"].includes(reg.status)) return "skip";
    return { data: await brandedQrBuffer(reg.reference_id, { width: 640, margin: 2 }), mimetype: "image/png", filename: `${reg.reference_id}.png` };
  }
  return null;
}

async function finish(admin: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { error } = await admin.from("whatsapp_outbox").update(patch).eq("id", id);
  if (error) console.error(`[whatsapp] couldn't update outbox ${id}:`, error.message);
}

/**
 * One run of the outbox (the cron calls this every minute): sends at most
 * WHATSAPP_PER_RUN messages, each after a short typing pause, stopping at the
 * daily cap. Pictures are built at send time, so a cancelled ticket or a
 * removed guest is skipped rather than sent. A failed send is retried 5
 * minutes later, up to 3 tries.
 */
export async function processWhatsAppOutbox(admin: SupabaseClient) {
  if (!whatsappConfig()) return { sent: 0, skipped: 0, failed: 0, note: "WhatsApp is off" };

  // don't spend tries while the phone is unlinked or the server is down
  const status = await sessionStatus();
  if (status?.status !== "WORKING") return { sent: 0, skipped: 0, failed: 0, error: `WhatsApp session is ${status?.status ?? "unknown"}` };

  const since = new Date(Date.now() - 86400_000).toISOString();
  const { count: sentToday } = await admin
    .from("whatsapp_outbox")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .neq("kind", "reply")
    .gte("sent_at", since);
  const room = dailyCap() - (sentToday ?? 0);
  if (room <= 0) return { sent: 0, skipped: 0, failed: 0, note: "Daily cap reached" };

  const { data: claimed, error } = await admin.rpc("claim_whatsapp_outbox", { p_limit: Math.min(perRunLimit(), room) });
  if (error) return { sent: 0, skipped: 0, failed: 0, error: error.message };

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of (claimed ?? []) as OutboxRow[]) {
    const chatId = chatIdFor(row.to_phone);
    if (!chatId || (await isOptedOut(admin, row.to_phone))) {
      await finish(admin, row.id, { status: "skipped", last_error: chatId ? "Opted out" : "Not a valid number" });
      skipped++;
      continue;
    }

    try {
      const image = await buildImage(admin, row);
      if (image === "skip") {
        await finish(admin, row.id, { status: "skipped", last_error: "No longer applies" });
        skipped++;
        continue;
      }

      await typingPause(chatId, 1200 + Math.round(Math.random() * 1500));
      if (image) {
        try {
          await sendImage(chatId, image, row.body);
        } catch (err) {
          // picture refused (engine or size): the words, plus a link if there is one
          console.error(`[whatsapp] image refused for ${row.id}, sending text:`, err instanceof Error ? err.message : err);
          await sendText(chatId, row.fallback_text ? `${row.body}\n\n${row.fallback_text}` : row.body);
        }
      } else {
        await sendText(chatId, row.body);
      }

      await finish(admin, row.id, { status: "sent", sent_at: new Date().toISOString(), last_error: null });
      if (row.kind === "invite" && row.guest_id) {
        await admin.from("event_guests").update({ invited_at: new Date().toISOString() }).eq("id", row.guest_id).is("invited_at", null);
      }
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const giveUp = row.attempts >= 3;
      await finish(admin, row.id, {
        status: giveUp ? "failed" : "queued",
        last_error: message.slice(0, 500),
        not_before: new Date(Date.now() + 5 * 60_000).toISOString(),
      });
      failed++;
    }
  }
  return { sent, skipped, failed };
}
