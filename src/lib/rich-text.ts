/** Every tag RichTextEditor's Tiptap config can actually produce — nothing else
 *  is allowed through on render, regardless of where the stored HTML came from
 *  (the editor's own output is schema-constrained already, but this is the
 *  boundary that actually matters: anything reaching the database could in
 *  principle have been written by some other path, e.g. a direct API call).
 *
 *  Deliberately hand-rolled, not a sanitizer package — this project shipped two
 *  in a row (isomorphic-dompurify, then sanitize-html) that each broke every
 *  register/discover/hub page in production the moment one rendered a
 *  description or announcement: isomorphic-dompurify pulls in jsdom, which
 *  esbuild can't cleanly bundle into a serverless function (dynamic requires by
 *  path that don't exist once bundled), and sanitize-html simply didn't survive
 *  Next's file-tracing into the deployed bundle at all — `require` throws at
 *  runtime either way, on a code path every public event page hits. A regex
 *  walk is safe here specifically because it never passes attributes through
 *  verbatim — every emitted tag is rebuilt from scratch with only values this
 *  function has itself validated (an http(s) href, nothing else), which rules
 *  out attribute-based injection regardless of what was in the original attrs
 *  string, and the fixed tag allowlist rules out anything else executable
 *  (script/style/on*-handler-bearing tags are stripped entirely, tag and
 *  attributes both — img is allowed but, like `a`, only ever rebuilt from a
 *  validated `src`, never the original attrs string, so an `onerror`/`onload`
 *  handler on the original tag can never survive). Has zero runtime
 *  dependencies, so there's nothing left for a bundler to fail to trace. */
const ALLOWED_TAGS = new Set(["p", "strong", "em", "ul", "ol", "li", "a", "br", "img"]);

const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
const HREF_RE = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const SRC_RE = /src\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const ALT_RE = /alt\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
// Anchored to the start of the style value (not just "contains width:...")
// specifically so it can't greedily match "max-width:100%" instead of the
// real "width:NN%" that always comes first in what this file itself emits.
// \s* after the colon because the DOM's own style serialization (what the
// editor's getHTML() actually produces) inserts a space — "width: 55%", not
// "width:55%" — confirmed against the real Tiptap output, not assumed.
const IMG_WIDTH_RE = /style\s*=\s*(?:"width:\s*(\d{1,3})%|'width:\s*(\d{1,3})%)/i;

/** Safe to pass straight to dangerouslySetInnerHTML. */
export function sanitizeRichTextHtml(html: string): string {
  return html.replace(TAG_RE, (full, tagNameRaw: string, attrs: string) => {
    const tagName = tagNameRaw.toLowerCase();
    if (!ALLOWED_TAGS.has(tagName)) return "";
    if (full.startsWith("</")) return `</${tagName}>`;
    if (tagName === "br") return "<br>";
    if (tagName === "a") {
      const match = HREF_RE.exec(attrs);
      const href = match ? match[1] ?? match[2] ?? "" : "";
      if (/^https?:\/\//i.test(href)) {
        return `<a href="${href.replace(/"/g, "&quot;")}" target="_blank" rel="noreferrer noopener">`;
      }
      return "<a>";
    }
    if (tagName === "img") {
      const srcMatch = SRC_RE.exec(attrs);
      const src = srcMatch ? srcMatch[1] ?? srcMatch[2] ?? "" : "";
      if (!/^(https:\/\/|data:image\/)/i.test(src)) return "";
      const altMatch = ALT_RE.exec(attrs);
      const alt = (altMatch ? altMatch[1] ?? altMatch[2] ?? "" : "").replace(/"/g, "&quot;");
      // Only a plain "NN%" width survives — never the raw style string — so a
      // resized image keeps its size without opening up arbitrary CSS injection
      // via the style attribute.
      const widthMatch = IMG_WIDTH_RE.exec(attrs);
      const widthPct = widthMatch ? widthMatch[1] ?? widthMatch[2] : null;
      const width = widthPct ? `${Math.min(100, Math.max(5, Number(widthPct)))}%` : "55%";
      return `<img src="${src.replace(/"/g, "&quot;")}" alt="${alt}" style="width:${width};max-width:100%;height:auto;">`;
    }
    return `<${tagName}>`;
  });
}

/** Every description/announcement field predates RichTextEditor and holds plain
 *  text (possibly with newlines), not HTML — this distinguishes the two so
 *  RichTextDisplay can render old rows exactly as before (newlines preserved via
 *  white-space) instead of showing literal "<p>" tags or collapsing paragraph
 *  breaks. New content saved via RichTextEditor always starts with a real tag. */
export function looksLikeHtml(value: string): boolean {
  return /^\s*<[a-z][\s\S]*>/i.test(value);
}

/** Plain-text summary for contexts HTML can't go: JSON-LD/meta descriptions,
 *  and the plain-text fallback part of an email. A no-op on already-plain text. */
export function stripHtml(html: string): string {
  return html
    .replace(/<\/(p|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
