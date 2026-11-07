import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidEmail } from "@/lib/validation";

/** Imported contact lists for eventbuddy's own campaigns (migration 0141).
 *  Platform admins only. */

export async function GET() {
  const auth = await requirePlatformAdmin();
  if ("response" in auth) return auth.response;
  const admin = createAdminClient();
  const { data: lists, error } = await admin.from("platform_contact_lists").select("id, name, created_at").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const counts = await Promise.all(
    (lists ?? []).map(async (l) => {
      const { count } = await admin.from("platform_contacts").select("id", { count: "exact", head: true }).eq("list_id", l.id);
      return count ?? 0;
    })
  );
  return NextResponse.json({ lists: (lists ?? []).map((l, i) => ({ id: l.id, name: l.name, createdAt: l.created_at, count: counts[i] })) });
}

const Contact = z.object({ email: z.string().max(254), name: z.string().max(200).optional() });
const Body = z.object({
  name: z.string().trim().min(1, "Name the list.").max(120),
  // an existing list to add to, instead of making a new one
  listId: z.string().uuid().optional(),
  contacts: z.array(Contact).min(1, "Add at least one email address.").max(50000, "Import at most 50,000 addresses at a time."),
});

/** Creates a list (or adds to one): invalid addresses and duplicates (within
 *  the upload and already on the list) are skipped and counted. */
export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if ("response" in auth) return auth.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the list and try again." }, { status: 400 });
  const { name, listId, contacts } = parsed.data;

  const seen = new Set<string>();
  const rows: { email: string; full_name: string | null }[] = [];
  let invalid = 0;
  for (const c of contacts) {
    const email = c.email.trim().toLowerCase();
    if (!isValidEmail(email)) {
      invalid++;
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    rows.push({ email, full_name: c.name?.trim() || null });
  }
  if (rows.length === 0) return NextResponse.json({ error: "None of those are valid email addresses." }, { status: 400 });

  const admin = createAdminClient();
  let id = listId;
  if (id) {
    const { data: existing } = await admin.from("platform_contact_lists").select("id").eq("id", id).maybeSingle();
    if (!existing) return NextResponse.json({ error: "That list couldn't be found." }, { status: 404 });
  } else {
    const { data: created, error } = await admin.from("platform_contact_lists").insert({ name, created_by: auth.userId }).select("id").single();
    if (error || !created) return NextResponse.json({ error: error?.message || "Couldn't create the list." }, { status: 500 });
    id = created.id;
  }

  const before = (await admin.from("platform_contacts").select("id", { count: "exact", head: true }).eq("list_id", id)).count ?? 0;
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await admin
      .from("platform_contacts")
      .upsert(rows.slice(i, i + 1000).map((r) => ({ ...r, list_id: id })), { onConflict: "list_id,email", ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const after = (await admin.from("platform_contacts").select("id", { count: "exact", head: true }).eq("list_id", id)).count ?? 0;
  return NextResponse.json({ listId: id, added: after - before, duplicates: rows.length - (after - before) + (contacts.length - invalid - rows.length), invalid, total: after });
}
