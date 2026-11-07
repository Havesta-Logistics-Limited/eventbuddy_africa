import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeRichTextHtml } from "@/lib/rich-text";
import { AudienceSchema, GreetingSchema } from "@/lib/platform-campaigns";

/** Saves a campaign being written as a draft (migration 0144), so leaving the
 *  page doesn't lose it. The page autosaves; the first save returns the id and
 *  later saves update that draft. Platform admins only. */
const Body = z.object({
  id: z.string().uuid().optional(),
  subject: z.string().max(200).default(""),
  // pasted pictures are kept inline until the send uploads them
  messageHtml: z.string().max(6_000_000, "This message is too large to save. Use smaller pictures.").default(""),
  ctaLabel: z.string().max(60).optional(),
  ctaUrl: z.string().max(2000).optional(),
  audience: AudienceSchema.nullable().optional(),
  greeting: GreetingSchema.nullable().optional(),
});

export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if ("response" in auth) return auth.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Couldn't save the draft." }, { status: 400 });
  const d = parsed.data;
  const fields = {
    subject: d.subject.trim(),
    message_html: d.messageHtml ? sanitizeRichTextHtml(d.messageHtml) : "",
    cta_label: d.ctaLabel?.trim() || null,
    cta_url: d.ctaUrl?.trim() || null,
    audience: d.audience ?? null,
    greeting: d.greeting ?? null,
    updated_at: new Date().toISOString(),
  };
  const admin = createAdminClient();
  if (d.id) {
    const { data, error } = await admin.from("platform_campaigns").update(fields).eq("id", d.id).eq("status", "draft").select("id, updated_at").maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "This draft was sent or deleted. Your text is still on the page." }, { status: 409 });
    return NextResponse.json({ id: data.id, savedAt: data.updated_at });
  }
  const { data, error } = await admin
    .from("platform_campaigns")
    .insert({ ...fields, status: "draft", sent_by: auth.userId })
    .select("id, updated_at")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Couldn't save the draft." }, { status: 500 });
  return NextResponse.json({ id: data.id, savedAt: data.updated_at });
}
