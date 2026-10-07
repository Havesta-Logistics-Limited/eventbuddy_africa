import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { emailButton, escapeHtml, renderEmailShell } from "@/lib/email-template";

/** Organizer verification requests (migration 0118). */

export const VERIFICATION_BUCKET = "verification-docs";
export const ID_TYPES = { nin: "NIN slip or card", drivers_licence: "Driver's licence", passport: "International passport", voters_card: "Voter's card" } as const;
export type IdType = keyof typeof ID_TYPES;

const MIME_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const MAX_BYTES = 5 * 1024 * 1024;

/** Stores one uploaded document (a data: URL) in the private bucket; returns its path or an error. */
export async function storeVerificationDoc(admin: SupabaseClient, path: string, dataUrl: string): Promise<{ path: string } | { error: string }> {
  const m = dataUrl.match(/^data:([a-z/+.-]+);base64,(.+)$/i);
  const ext = m ? MIME_EXT[m[1].toLowerCase()] : undefined;
  if (!m || !ext) return { error: "Upload a photo (JPG, PNG, WebP) or a PDF." };
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > MAX_BYTES) return { error: "Each document must be under 5 MB." };
  const full = `${path}.${ext}`;
  const { error } = await admin.storage.from(VERIFICATION_BUCKET).upload(full, bytes, { contentType: m[1].toLowerCase(), upsert: true });
  if (error) return { error: "Couldn't upload the document. Please try again." };
  return { path: full };
}

/** How closely the bank account name matches the name given: shared words. */
export function nameMatch(accountName: string | null, ...names: (string | null | undefined)[]): "match" | "partial" | "none" | "unknown" {
  if (!accountName) return "unknown";
  const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !["ltd", "limited", "and", "the", "enterprises", "ventures", "nig", "nigeria"].includes(w)));
  const acct = words(accountName);
  let best = 0;
  for (const n of names) {
    if (!n) continue;
    const w = words(n);
    const shared = [...w].filter((x) => acct.has(x)).length;
    best = Math.max(best, w.size ? shared / Math.min(w.size, acct.size || 1) : 0);
  }
  return best >= 0.99 ? "match" : best > 0 ? "partial" : "none";
}

const PINK = "#C21FAF";

async function send(to: string | string[], subject: string, text: string, label: string, emoji: string, body: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") return false;
  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject,
      text,
      html: renderEmailShell({ color: PINK, label, emoji }, body),
    });
    return !error;
  } catch {
    return false;
  }
}

export async function emailAdminsNewRequest(admin: SupabaseClient, orgName: string, siteUrl: string) {
  const { data } = await admin.from("platform_admins").select("email");
  const to = (data ?? []).map((r: { email: string | null }) => r.email).filter((e): e is string => !!e);
  if (!to.length) return false;
  return send(
    to,
    `Verification request: ${orgName}`,
    `${orgName} asked to be verified. Review it: ${siteUrl}/platform?tab=payouts`,
    "Verification request",
    "🪪",
    `<p style="margin:0 0 14px;"><strong>${escapeHtml(orgName)}</strong> sent their documents and asked to be verified.</p>
     <p style="margin:0 0 20px;">Check the ID and that the bank account name matches before approving. Approving lifts their sales limit and allows early payouts.</p>
     ${emailButton(`${siteUrl}/platform?tab=payouts`, "Review the request", PINK)}`
  );
}

export function emailOrganizerDecision(to: string, orgName: string, approved: boolean, reason: string | null, siteUrl: string) {
  return approved
    ? send(
        to,
        "Your eventbuddy account is verified",
        `${orgName} is now verified on eventbuddy: no limit on paid ticket sales, and you can request payouts before your events end.`,
        "Verified",
        "✅",
        `<p style="margin:0 0 14px;"><strong>${escapeHtml(orgName)}</strong> is now verified on eventbuddy.</p>
         <p style="margin:0 0 20px;">There's no longer a limit on paid ticket sales, and you can request payouts of cleared money before your events end.</p>
         ${emailButton(`${siteUrl}/payouts`, "Go to Payouts", PINK)}`
      )
    : send(
        to,
        "About your eventbuddy verification",
        `We couldn't verify ${orgName} yet. ${reason ?? ""} You can send new documents from your Payouts page: ${siteUrl}/payouts`,
        "Verification",
        "🪪",
        `<p style="margin:0 0 14px;">We couldn't verify <strong>${escapeHtml(orgName)}</strong> yet.</p>
         ${reason ? `<p style="margin:0 0 14px;">Our note: ${escapeHtml(reason)}</p>` : ""}
         <p style="margin:0 0 20px;">You can send new documents from your Payouts page whenever you're ready.</p>
         ${emailButton(`${siteUrl}/payouts`, "Send new documents", PINK)}`
      );
}
