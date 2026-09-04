import { looksLikeHtml, sanitizeRichTextHtml } from "@/lib/rich-text";

/** Renders a description/announcement field written either by RichTextEditor
 *  (HTML) or, for anything saved before it existed, as plain text — see
 *  looksLikeHtml. Always sanitizes before dangerouslySetInnerHTML regardless of
 *  which branch, since this renders on public pages attendees visit. */
export function RichTextDisplay({ html, className }: { html: string; className?: string }) {
  if (!html) return null;
  if (!looksLikeHtml(html)) {
    return <p className={`whitespace-pre-line ${className || ""}`}>{html}</p>;
  }
  return <div className={`rich-text-content ${className || ""}`} dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(html) }} />;
}
