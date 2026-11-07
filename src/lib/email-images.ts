import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Pictures pasted into a blast or campaign arrive as data:image URLs. Most
 * email clients won't show those, and Resend's batch API (which every blast
 * and campaign uses) silently drops attachments, so the old cid: approach sent
 * the text with no image at all. Instead each picture is uploaded once to the
 * public event-media bucket and the email points at its https address, which
 * Gmail, Outlook and Apple Mail all show.
 */

const TYPES: Record<string, string> = { png: "png", jpeg: "jpg", jpg: "jpg", gif: "gif", webp: "webp" };

/** Uploads every embedded picture under `pathPrefix` (e.g. "platform/campaigns/<id>")
 *  and returns the HTML pointing at the uploaded files. A picture that can't be
 *  uploaded, or isn't an image type the bucket accepts, is left out rather
 *  than sent broken. Run once per send, before building each recipient's email. */
export async function hostInlineImages(admin: SupabaseClient, html: string, pathPrefix: string): Promise<string> {
  const re = /<img\s+[^>]*src="data:image\/([a-zA-Z0-9.+-]+);base64,([^"]+)"[^>]*>/g;
  const matches = [...html.matchAll(re)];
  if (matches.length === 0) return html;

  const replacements = await Promise.all(
    matches.map(async (m, i) => {
      const [full, subtypeRaw, base64] = m;
      const ext = TYPES[subtypeRaw.toLowerCase()];
      if (!ext) return "";
      const path = `${pathPrefix}/image-${i + 1}.${ext}`;
      const contentType = `image/${ext === "jpg" ? "jpeg" : ext}`;
      const { error } = await admin.storage.from("event-media").upload(path, Buffer.from(base64, "base64"), { upsert: true, contentType });
      if (error) {
        console.error(`[email-images] couldn't upload ${path}:`, error.message);
        return "";
      }
      const url = admin.storage.from("event-media").getPublicUrl(path).data.publicUrl;
      // only the address changes: size, alignment and the picture's link
      // (data-href) stay exactly as the sanitizer left them
      return full.replace(/src="data:image\/[^"]+"/, `src="${url}"`);
    })
  );

  let out = "";
  let last = 0;
  matches.forEach((m, i) => {
    out += html.slice(last, m.index) + replacements[i];
    last = (m.index ?? 0) + m[0].length;
  });
  return out + html.slice(last);
}

/** Adds tracking tags to every link in `html` (and returns a tagger for single
 *  URLs such as a button) that points at eventbuddy's own site, so visits and
 *  ticket sales from the email are credited to it in the marketing report
 *  (marketing-attribution reads utm_source and utm_campaign). Links to other
 *  sites are left exactly as written. */
export function trackingTagger(tags: { source: string; campaign: string }) {
  const siteHosts = new Set(["eventbuddy.africa", "www.eventbuddy.africa"]);
  try {
    if (process.env.NEXT_PUBLIC_SITE_URL) siteHosts.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).host);
  } catch {
    // no usable site URL configured: the two eventbuddy hosts still apply
  }
  const tagUrl = (raw: string): string => {
    try {
      const u = new URL(raw.replace(/&amp;/g, "&"));
      if (!siteHosts.has(u.host) || u.searchParams.has("utm_source")) return raw;
      u.searchParams.set("utm_source", tags.source);
      u.searchParams.set("utm_medium", "email");
      u.searchParams.set("utm_campaign", tags.campaign);
      return u.toString().replace(/&/g, "&amp;");
    } catch {
      return raw;
    }
  };
  return {
    url: (raw: string) => tagUrl(raw).replace(/&amp;/g, "&"),
    html: (html: string) => html.replace(/href="(https?:\/\/[^"]+)"/g, (_m, href: string) => `href="${tagUrl(href)}"`),
  };
}
