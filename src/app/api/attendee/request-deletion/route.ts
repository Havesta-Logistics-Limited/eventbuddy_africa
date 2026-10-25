import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAnonClient } from "@/lib/supabase/anon";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml, renderEmailShell } from "@/lib/email-template";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rate-limit";

/** Best-effort alert to the team so a pending row doesn't just sit unnoticed until
 *  someone happens to check the table — same "email on top of a DB row" pattern as
 *  every other request-style flow in this app. */
async function notifyTeam(email: string, fullName: string | null) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return;

  const bodyHtml = `
    <p style="margin:0 0 16px;">An attendee requested account deletion from the mobile app:</p>
    <p style="margin:0 0 4px;"><strong>Name:</strong> ${escapeHtml(fullName || "—")}</p>
    <p style="margin:0 0 20px;"><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p style="margin:0 0 20px; color:#666; font-size:13px;">Review and delete the account within 48 hours (Supabase Auth > Users, or the /platform admin panel).</p>
  `;

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to: "info@eventbuddy.africa",
      subject: `Account deletion request — ${email}`,
      text: `Account deletion request from ${fullName || email} (${email}). Review within 48 hours.`,
      html: renderEmailShell({ color: "#170821", label: "Account deletion request", emoji: "🗑️" }, bodyHtml),
    });
  } catch (err) {
    console.error("[request-deletion] notification email failed:", err instanceof Error ? err.message : err);
  }
}

/** Same identity model as /api/attendee/push-token — the caller's Supabase access
 *  token is verified server-side, never trusted from the request body, since this
 *  creates a record tied to a specific account. */
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

  if (!(await checkRateLimit(`request-deletion:user:${user.id}`, 3, 24 * 60 * 60))) {
    return rateLimitedResponse();
  }
  if (!(await checkRateLimit(`request-deletion:ip:${clientIp(request)}`, 10, 60 * 60))) {
    return rateLimitedResponse();
  }

  // The password, like the web's /api/account/request-deletion: a stolen or
  // unlocked phone's session alone can't start deleting the account.
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password) return NextResponse.json({ error: "Enter your password." }, { status: 400 });
  const verifier = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: authError } = await verifier.auth.signInWithPassword({ email: user.email, password });
  if (authError) return NextResponse.json({ error: "Incorrect password." }, { status: 400 });

  const admin = createAdminClient();
  const fullName = (user.user_metadata?.full_name as string) || null;
  const { error: insertError } = await admin.from("account_deletion_requests").insert({ user_id: user.id, email: user.email, full_name: fullName });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  await notifyTeam(user.email, fullName);

  return NextResponse.json({ success: true });
}
