import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Best-effort push notification to every device an attendee has registered (see
 * device_push_tokens / /api/attendee/push-token) — mirrors how every email send in
 * this app is already best-effort (a failure here never blocks the registration/
 * payment flow that triggered it). Uses Expo's push service directly; no FCM/APNs
 * credentials needed since this is an EAS-managed project.
 */
export async function sendPushToAttendee(supabase: SupabaseClient, email: string, title: string, body: string, data?: Record<string, unknown>) {
  try {
    const { data: tokens } = await supabase.from("device_push_tokens").select("expo_push_token").ilike("email", email);
    if (!tokens || tokens.length === 0) return;

    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(
        tokens.map((t) => ({
          to: t.expo_push_token,
          title,
          body,
          data: data || {},
          sound: "default",
        }))
      ),
    });
  } catch (err) {
    console.error(`[push] couldn't notify ${email}:`, err instanceof Error ? err.message : err);
  }
}
