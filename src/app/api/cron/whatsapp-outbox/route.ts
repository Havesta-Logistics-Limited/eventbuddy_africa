import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/cron-auth";
import { processWhatsAppOutbox } from "@/lib/whatsapp-outbox";

/**
 * netlify/functions/whatsapp-outbox-cron.mts calls this every minute; each run
 * sends a couple of queued WhatsApp messages (migration 0146). Not recorded in
 * Job health: a run a minute would bury the other jobs.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await processWhatsAppOutbox(createAdminClient());
  return NextResponse.json(result, { status: "error" in result && result.error ? 503 : 200 });
}
