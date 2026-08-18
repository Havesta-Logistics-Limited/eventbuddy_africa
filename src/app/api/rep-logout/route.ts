import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Flips a rep's is_online back off — used by logout() and forceLogoutRep() in store.ts. */
export async function POST(request: Request) {
  const { staffId } = (await request.json()) as { staffId?: string };
  if (!staffId) return NextResponse.json({ error: "Missing staffId." }, { status: 400 });

  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || apiKey === "paste_your_supabase_service_role_key_here") {
    return NextResponse.json({ error: "Not configured yet." }, { status: 500 });
  }

  const supabase = createAdminClient();
  await supabase.from("staff").update({ is_online: false }).eq("id", staffId);

  return NextResponse.json({ success: true });
}
