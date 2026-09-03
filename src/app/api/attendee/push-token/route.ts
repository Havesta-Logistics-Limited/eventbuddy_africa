import { NextResponse } from "next/server";
import { z } from "zod";
import { createAnonClient } from "@/lib/supabase/anon";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Registers (or re-registers) an attendee's device for push notifications. Unlike
 * every other attendee-facing route in this file's neighborhood, this one genuinely
 * needs to know WHO is calling — a spoofable client-supplied email would let anyone
 * register a push token against someone else's address and start receiving their
 * ticket confirmations, so the caller's Supabase access token (sent as a Bearer
 * header, since the mobile app has no cookie session) is verified server-side via
 * the anon client's getUser(jwt), and the email/user id are taken from that
 * verified result — never from the request body.
 */
const BodySchema = z.object({
  expoPushToken: z.string().trim().min(1),
  platform: z.enum(["ios", "android"]),
});

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Missing Authorization header." }, { status: 401 });

  const anon = createAnonClient();
  const {
    data: { user },
    error: userError,
  } = await anon.auth.getUser(token);
  if (userError || !user?.email) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

  const body = await request.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error: upsertError } = await admin
    .from("device_push_tokens")
    .upsert(
      { user_id: user.id, email: user.email, expo_push_token: parsed.data.expoPushToken, platform: parsed.data.platform, updated_at: new Date().toISOString() },
      { onConflict: "expo_push_token" }
    );
  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
