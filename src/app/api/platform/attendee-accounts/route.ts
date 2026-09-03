import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Attendee accounts (the eventbuddy mobile app's signups) live in auth.users, which
 * isn't a regular table RLS can expose to the browser client — same reason every
 * other privileged read in /platform goes through a dedicated route instead. Filters
 * on user_metadata.account_type === "attendee" to exclude organizer accounts, which
 * share the same auth.users table (see /api/attendee/signup's own comment on this).
 */
export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: membership } = await supabase.from("platform_admins").select("user_id").eq("user_id", caller.id).maybeSingle();
  if (!membership) return NextResponse.json({ error: "Only platform admins can do this." }, { status: 403 });

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY === "paste_your_supabase_service_role_key_here") {
    return NextResponse.json({ error: "Not configured yet." }, { status: 500 });
  }

  const admin = createAdminClient();
  const attendees: { id: string; email: string; fullName: string; createdAt: string }[] = [];
  const perPage = 1000;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const u of data.users) {
      if (u.user_metadata?.account_type === "attendee") {
        attendees.push({ id: u.id, email: u.email || "", fullName: (u.user_metadata?.full_name as string) || "", createdAt: u.created_at });
      }
    }
    if (data.users.length < perPage) break;
  }

  attendees.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return NextResponse.json({ total: attendees.length, attendees });
}
