import DOMPurify from "isomorphic-dompurify";

/** Every tag/attribute RichTextEditor's Tiptap config can actually produce —
 *  nothing else is allowed through on render, regardless of where the stored HTML
 *  came from (the editor's own output is schema-constrained already, but this is
 *  the boundary that actually matters: anything reaching the database could in
 *  principle have been written by some other path, e.g. a direct API call). */
const ALLOWED_TAGS = ["p", "strong", "em", "ul", "ol", "li", "a", "br"];
const ALLOWED_ATTR = ["href", "target", "rel"];

/** Safe to pass straight to dangerouslySetInnerHTML. */
export function sanitizeRichTextHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
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
  return sanitizeRichTextHtml(html)
    .replace(/<\/(p|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
