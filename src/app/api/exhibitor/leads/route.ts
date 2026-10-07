import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPortal } from "@/lib/exhibitors";

/** The exhibitor's leads, newest first. */
export async function GET(request: Request) {
  const admin = createAdminClient();
  const x = await loadPortal(admin, new URL(request.url).searchParams.get("token"));
  if (!x || x.status !== "paid") return NextResponse.json({ error: "This portal link isn't valid." }, { status: 404 });
  const { data } = await admin
    .from("exhibitor_leads")
    .select("id, rating, notes, captured_by, captured_at, registrations(full_name, email, phone)")
    .eq("exhibitor_id", x.id)
    .order("captured_at", { ascending: false });
  return NextResponse.json({
    leads: (data ?? []).map((l) => {
      const r = l.registrations as unknown as { full_name: string; email: string; phone: string | null } | null;
      return { id: l.id, name: r?.full_name ?? "", email: r?.email ?? "", phone: r?.phone ?? null, rating: l.rating, notes: l.notes ?? "", capturedBy: l.captured_by, capturedAt: l.captured_at };
    }),
  });
}

const Patch = z.object({
  token: z.string(),
  leadId: z.string().uuid(),
  rating: z.enum(["hot", "warm", "cold"]).nullable().optional(),
  notes: z.string().max(2000).optional(),
});

/** Rate a lead or add notes. */
export async function PATCH(request: Request) {
  const parsed = Patch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const admin = createAdminClient();
  const x = await loadPortal(admin, parsed.data.token);
  if (!x || x.status !== "paid") return NextResponse.json({ error: "This portal link isn't valid." }, { status: 404 });
  const patch: Record<string, unknown> = {};
  if (parsed.data.rating !== undefined) patch.rating = parsed.data.rating;
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes.trim() || null;
  const { error } = await admin.from("exhibitor_leads").update(patch).eq("id", parsed.data.leadId).eq("exhibitor_id", x.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
