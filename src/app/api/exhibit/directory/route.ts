import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";

/** Public: an event's listed, paid exhibitors (0116), for the event page. */
export async function GET(request: Request) {
  const eventId = new URL(request.url).searchParams.get("eventId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return NextResponse.json({ exhibitors: [] });
  const { data } = await createAnonClient().rpc("public_event_exhibitors", { p_event_id: eventId });
  return NextResponse.json({
    exhibitors: ((data ?? []) as { id: string; company_name: string; logo_url: string | null; stand_label: string | null }[]).map((x) => ({
      id: x.id,
      company: x.company_name,
      logoUrl: x.logo_url,
      standLabel: x.stand_label,
    })),
  });
}
